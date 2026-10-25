const WebSocket = require('ws');
const port = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port });

const rooms = new Map();

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'create_room':
                    const roomId = data.roomName;
                    rooms.set(roomId, {
                        id: roomId,
                        author: data.author,
                        gameData: data.gameData,
                        players: new Map()
                    });
                    // После создания сразу заходим в неё
                    joinRoom(ws, roomId);
                    break;
                    
                case 'join_room':
                    joinRoom(ws, data.roomId);
                    break;
                    
                case 'update_position':
                    if (ws.roomId && ws.playerId) {
                        const room = rooms.get(ws.roomId);
                        if (room && room.players.has(ws.playerId)) {
                            room.players.get(ws.playerId).position = data.position;
                            // Рассылаем всем ОСТАЛЬНЫМ игрокам
                            broadcastToRoom(ws.roomId, {
                                type: 'player_moved',
                                playerId: ws.playerId,
                                position: data.position
                            }, ws.playerId);
                        }
                    }
                    break;
                    
                case 'leave_room':
                    leaveRoom(ws);
                    break;
            }
        } catch (e) {
            console.error('Ошибка парсинга:', e);
        }
    });

    ws.on('close', () => leaveRoom(ws));
});

function joinRoom(ws, roomId) {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, { id: roomId, players: new Map() });
    }
    
    const room = rooms.get(roomId);
    const playerId = generateId();
    
    // СОХРАНЯЕМ САМ WEBSOCKET (ws) вместе с игроком! Это и было ошибкой.
    room.players.set(playerId, { ws, position: { x: 0, y: 5, z: 0 } });
    
    ws.roomId = roomId;
    ws.playerId = playerId;
    
    // Отправляем данные новому игроку
    ws.send(JSON.stringify({
        type: 'joined_room',
        roomId: roomId,
        playerId: playerId,
        gameData: room.gameData,
        players: Array.from(room.players.entries())
            .filter(([id]) => id !== playerId)
            .map(([id, p]) => ({ id, position: p.position }))
    }));
    
    // Сообщаем ОСТАЛЬНЫМ, что зашел новый игрок
    broadcastToRoom(roomId, {
        type: 'player_joined',
        playerId: playerId,
        position: { x: 0, y: 5, z: 0 }
    }, playerId);
}

function leaveRoom(ws) {
    if (!ws.roomId || !ws.playerId) return;
    const room = rooms.get(ws.roomId);
    if (room) {
        room.players.delete(ws.playerId);
        broadcastToRoom(ws.roomId, {
            type: 'player_left',
            playerId: ws.playerId
        }, ws.playerId);
        
        if (room.players.size === 0) {
            rooms.delete(ws.roomId);
        }
    }
    ws.roomId = null;
    ws.playerId = null;
}

function broadcastToRoom(roomId, message, excludeId = null) {
    const room = rooms.get(roomId);
    if (!room) return;
    const msgStr = JSON.stringify(message);
    
    room.players.forEach((player, id) => {
        if (id !== excludeId && player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(msgStr); // Отправляем через сохраненный ws
        }
    });
}

function generateId() {
    return Math.random().toString(36).substring(2, 10);
}

console.log(`WebSocket сервер запущен на порту ${port}`);
