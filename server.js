const WebSocket = require('ws');
const server = new WebSocket.Server({ port: process.env.PORT || 8080 });

let games = new Map();
let clients = new Map();

server.on('connection', (ws, req) => {
    const clientId = Date.now() + '-' + Math.random().toString(36).substr(2, 8);
    clients.set(clientId, ws);
    console.log(`Client ${clientId} connected`);

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'get_games_list':
                    const gamesList = Array.from(games.entries()).map(([id, game]) => ({
                        id: id,
                        name: game.name,
                        author: game.author,
                        players: game.players.size
                    }));
                    ws.send(JSON.stringify({ type: 'games_list', games: gamesList }));
                    break;
                    
                case 'create_game':
                    const gameId = Date.now() + '-' + Math.random().toString(36).substr(2, 8);
                    const game = {
                        name: data.gameName,
                        author: data.author,
                        gameData: data.gameData,
                        players: new Map([[clientId, ws]])
                    };
                    games.set(gameId, game);
                    ws.send(JSON.stringify({ type: 'game_created', gameId: gameId, gameName: data.gameName }));
                    ws.send(JSON.stringify({ type: 'joined', playerId: clientId, gameData: data.gameData, gameName: data.gameName }));
                    break;
                    
                case 'join_game':
                    const targetGame = games.get(data.gameId);
                    if (targetGame) {
                        targetGame.players.set(clientId, ws);
                        ws.send(JSON.stringify({ type: 'joined', playerId: clientId, gameData: targetGame.gameData, gameName: targetGame.name }));
                        targetGame.players.forEach((playerWs, playerId) => {
                            if (playerId !== clientId) {
                                playerWs.send(JSON.stringify({ type: 'player_joined', playerId: clientId, position: { x: 0, y: 1, z: 0 } }));
                                ws.send(JSON.stringify({ type: 'player_joined', playerId: playerId, position: { x: 0, y: 1, z: 0 } }));
                            }
                        });
                    } else {
                        ws.send(JSON.stringify({ type: 'error', message: 'Game not found' }));
                    }
                    break;
                    
                case 'update_position':
                    for (let [gid, gameRoom] of games) {
                        if (gameRoom.players.has(clientId)) {
                            gameRoom.players.forEach((playerWs, playerId) => {
                                if (playerId !== clientId) {
                                    playerWs.send(JSON.stringify({ type: 'player_moved', playerId: clientId, position: data.position }));
                                }
                            });
                            break;
                        }
                    }
                    break;
                    
                case 'leave_game':
                    for (let [gid, gameRoom] of games) {
                        if (gameRoom.players.has(clientId)) {
                            gameRoom.players.delete(clientId);
                            gameRoom.players.forEach((playerWs) => {
                                playerWs.send(JSON.stringify({ type: 'player_left', playerId: clientId }));
                            });
                            if (gameRoom.players.size === 0) {
                                games.delete(gid);
                            }
                            break;
                        }
                    }
                    break;
            }
        } catch(e) { console.error('Message error:', e); }
    });
    
    ws.on('close', () => {
        console.log(`Client ${clientId} disconnected`);
        for (let [gid, gameRoom] of games) {
            if (gameRoom.players.has(clientId)) {
                gameRoom.players.delete(clientId);
                gameRoom.players.forEach((playerWs) => {
                    playerWs.send(JSON.stringify({ type: 'player_left', playerId: clientId }));
                });
                if (gameRoom.players.size === 0) games.delete(gid);
                break;
            }
        }
        clients.delete(clientId);
    });
});

console.log(`Signal server running on port ${process.env.PORT || 8080}`);
