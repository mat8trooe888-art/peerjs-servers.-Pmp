const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Хранилище игр (комнат)
const games = new Map();

function generateGameId() {
    return Math.random().toString(36).substring(2, 8);
}

wss.on('connection', (ws) => {
    let currentGame = null;
    let playerId = null;

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        
        switch (data.type) {
            case 'create_game':
                const gameId = generateGameId();
                const gameData = data.gameData;
                games.set(gameId, {
                    id: gameId,
                    name: data.gameName,
                    author: data.author,
                    gameData: gameData,
                    players: new Map(),
                    nextPlayerId: 1,
                    createdAt: Date.now()
                });
                ws.send(JSON.stringify({ type: 'game_created', gameId, gameName: data.gameName }));
                break;

            case 'join_game':
                const game = games.get(data.gameId);
                if (!game) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Game not found' }));
                    return;
                }
                currentGame = game;
                playerId = game.nextPlayerId++;
                game.players.set(playerId, {
                    ws: ws,
                    position: { x: 0, y: 1, z: 0 },
                    rotation: { yaw: 0, pitch: 0 }
                });
                ws.send(JSON.stringify({ type: 'joined', playerId, gameData: game.gameData, gameName: game.name, players: Array.from(game.players.keys()) }));
                // Уведомляем всех в комнате о новом игроке
                game.players.forEach((player, id) => {
                    if (id !== playerId && player.ws.readyState === WebSocket.OPEN) {
                        player.ws.send(JSON.stringify({ type: 'player_joined', playerId, position: { x: 0, y: 1, z: 0 } }));
                    }
                });
                // Обновляем список игр для всех клиентов (изменение количества игроков)
                broadcastGameList();
                break;

            case 'update_position':
                if (!currentGame) return;
                const player = currentGame.players.get(playerId);
                if (player) {
                    player.position = data.position;
                    currentGame.players.forEach((p, id) => {
                        if (id !== playerId && p.ws.readyState === WebSocket.OPEN) {
                            p.ws.send(JSON.stringify({ type: 'player_moved', playerId, position: data.position }));
                        }
                    });
                }
                break;

            case 'leave_game':
                if (currentGame) {
                    currentGame.players.delete(playerId);
                    currentGame.players.forEach((p) => {
                        if (p.ws.readyState === WebSocket.OPEN) {
                            p.ws.send(JSON.stringify({ type: 'player_left', playerId }));
                        }
                    });
                    if (currentGame.players.size === 0) {
                        games.delete(currentGame.id);
                    }
                    broadcastGameList();
                }
                currentGame = null;
                playerId = null;
                break;

            case 'get_games_list':
                const gamesList = Array.from(games.values()).map(g => ({
                    id: g.id,
                    name: g.name,
                    author: g.author,
                    players: g.players.size,
                    createdAt: g.createdAt
                }));
                ws.send(JSON.stringify({ type: 'games_list', games: gamesList }));
                break;
        }
    });

    ws.on('close', () => {
        if (currentGame) {
            currentGame.players.delete(playerId);
            currentGame.players.forEach((p) => {
                if (p.ws.readyState === WebSocket.OPEN) {
                    p.ws.send(JSON.stringify({ type: 'player_left', playerId }));
                }
            });
            if (currentGame.players.size === 0) {
                games.delete(currentGame.id);
            }
            broadcastGameList();
        }
    });
});

function broadcastGameList() {
    const gamesList = Array.from(games.values()).map(g => ({
        id: g.id,
        name: g.name,
        author: g.author,
        players: g.players.size,
        createdAt: g.createdAt
    }));
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'games_list', games: gamesList }));
        }
    });
}

server.listen(process.env.PORT || 3000, () => {
    console.log(`WebSocket server running on port ${process.env.PORT || 3000}`);
});
