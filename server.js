const WebSocket = require('ws');

const server = new WebSocket.Server({ port: process.env.PORT || 8080 });

// Хранилище игр (опубликованные игры)
let games = new Map(); // gameId -> { name, author, gameData, publishedAt, servers: [] }

// Хранилище серверов (активные экземпляры игр)
let servers = new Map(); // serverId -> { gameId, region, players: Map(playerId -> ws), createdAt, lastActivity }

const REGIONS = ['europe', 'asia', 'america'];

server.on('connection', (ws) => {
    const playerId = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    let currentServerId = null;
    
    console.log(`✅ Игрок ${playerId} подключился`);

    ws.on('message', (rawMessage) => {
        try {
            const data = JSON.parse(rawMessage);
            
            switch (data.type) {
                // ========== ПОЛУЧИТЬ СПИСОК ОПУБЛИКОВАННЫХ ИГР ==========
                case 'get_published_games':
                    const gamesList = Array.from(games.entries()).map(([id, game]) => ({
                        id: id,
                        name: game.name,
                        author: game.author,
                        publishedAt: game.publishedAt,
                        activeServers: game.servers.filter(sid => servers.has(sid)).length
                    }));
                    ws.send(JSON.stringify({ type: 'published_games', games: gamesList }));
                    break;
                
                // ========== ОПУБЛИКОВАТЬ НОВУЮ ИГРУ ==========
                case 'publish_game':
                    const gameId = Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
                    games.set(gameId, {
                        name: data.gameName,
                        author: data.author,
                        gameData: data.gameData,
                        publishedAt: Date.now(),
                        servers: []
                    });
                    ws.send(JSON.stringify({ type: 'game_published', gameId: gameId, gameName: data.gameName }));
                    console.log(`📢 Игра "${data.gameName}" опубликована (${gameId})`);
                    break;
                
                // ========== ЗАПУСТИТЬ ИГРУ (СОЗДАТЬ/НАЙТИ СЕРВЕР) ==========
                case 'play_game':
                    const game = games.get(data.gameId);
                    if (!game) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Игра не найдена' }));
                        return;
                    }
                    
                    // Ищем активный сервер этой игры в регионе игрока
                    let availableServer = null;
                    for (let [sid, server] of servers) {
                        if (server.gameId === data.gameId && 
                            server.region === data.playerRegion && 
                            server.players.size < 50 &&
                            server.isActive !== false) {
                            availableServer = sid;
                            break;
                        }
                    }
                    
                    // Если нет сервера в регионе, ищем в других регионах
                    if (!availableServer) {
                        for (let [sid, server] of servers) {
                            if (server.gameId === data.gameId && server.players.size < 50 && server.isActive !== false) {
                                availableServer = sid;
                                break;
                            }
                        }
                    }
                    
                    let serverId;
                    if (availableServer) {
                        // Подключаемся к существующему серверу
                        serverId = availableServer;
                        console.log(`🔗 Игрок ${playerId} подключён к существующему серверу ${serverId}`);
                    } else {
                        // Создаём новый сервер
                        serverId = Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
                        servers.set(serverId, {
                            gameId: data.gameId,
                            region: data.playerRegion,
                            players: new Map(),
                            createdAt: Date.now(),
                            lastActivity: Date.now(),
                            isActive: true
                        });
                        game.servers.push(serverId);
                        console.log(`🆕 Создан новый сервер ${serverId} для игры "${game.name}" в регионе ${data.playerRegion}`);
                    }
                    
                    currentServerId = serverId;
                    const targetServer = servers.get(serverId);
                    targetServer.players.set(playerId, ws);
                    targetServer.lastActivity = Date.now();
                    
                    ws.send(JSON.stringify({
                        type: 'game_started',
                        serverId: serverId,
                        gameData: game.gameData,
                        players: Array.from(targetServer.players.entries()).map(([pid, pws]) => ({
                            id: pid,
                            position: { x: 0, y: 1.5, z: 0 },
                            name: `Player_${pid.substring(0, 6)}`
                        }))
                    }));
                    break;
                
                // ========== ОБНОВИТЬ ПОЗИЦИЮ ==========
                case 'update_position':
                    if (currentServerId) {
                        const server = servers.get(currentServerId);
                        if (server) {
                            server.lastActivity = Date.now();
                            server.players.forEach((playerWs, pid) => {
                                if (pid !== playerId && playerWs.readyState === WebSocket.OPEN) {
                                    playerWs.send(JSON.stringify({
                                        type: 'player_moved',
                                        playerId: playerId,
                                        position: data.position
                                    }));
                                }
                            });
                        }
                    }
                    break;
                
                // ========== ВЫЙТИ ИЗ ИГРЫ ==========
                case 'leave_game':
                    if (currentServerId) {
                        const server = servers.get(currentServerId);
                        if (server) {
                            server.players.delete(playerId);
                            server.players.forEach((playerWs) => {
                                if (playerWs.readyState === WebSocket.OPEN) {
                                    playerWs.send(JSON.stringify({
                                        type: 'player_left',
                                        playerId: playerId
                                    }));
                                }
                            });
                            
                            if (server.players.size === 0) {
                                // Сервер пуст, удаляем
                                servers.delete(currentServerId);
                                const game = games.get(server.gameId);
                                if (game) {
                                    const idx = game.servers.indexOf(currentServerId);
                                    if (idx !== -1) game.servers.splice(idx, 1);
                                }
                                console.log(`💤 Сервер ${currentServerId} удалён (пуст)`);
                            }
                        }
                        currentServerId = null;
                    }
                    break;
            }
        } catch (err) {
            console.error('Ошибка обработки:', err);
        }
    });
    
    ws.on('close', () => {
        console.log(`❌ Игрок ${playerId} отключился`);
        
        if (currentServerId) {
            const server = servers.get(currentServerId);
            if (server) {
                server.players.delete(playerId);
                if (server.players.size === 0) {
                    servers.delete(currentServerId);
                    const game = games.get(server.gameId);
                    if (game) {
                        const idx = game.servers.indexOf(currentServerId);
                        if (idx !== -1) game.servers.splice(idx, 1);
                    }
                    console.log(`💤 Сервер ${currentServerId} удалён (игрок отключился)`);
                }
            }
        }
    });
});

console.log(`🚀 Сигнальный сервер запущен на порту ${process.env.PORT || 8080}`);
console.log(`📍 Режим: игры публикуются, сервера создаются автоматически`);
