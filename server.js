const WebSocket = require('ws');
const server = new WebSocket.Server({ port: process.env.PORT || 8080 });

let rooms = new Map();

server.on('connection', ws => {
    const playerId = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    let currentRoomId = null;
    ws.isAlive = true;
    ws.on('pong', () => ws.isAlive = true);

    ws.on('message', raw => {
        try {
            const data = JSON.parse(raw);
            if (data.type === 'get_rooms') {
                const list = Array.from(rooms.entries()).map(([id, r]) => ({ id, name: r.name, author: r.author, players: r.players.size }));
                ws.send(JSON.stringify({ type: 'rooms_list', rooms: list }));
            } else if (data.type === 'create_room') {
                const roomId = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
                currentRoomId = roomId;
                rooms.set(roomId, { name: data.roomName, author: data.author, gameData: data.gameData, players: new Map([[playerId, ws]]) });
                ws.send(JSON.stringify({ type: 'room_created', roomId }));
                ws.send(JSON.stringify({ type: 'joined_room', playerId, roomId, gameData: data.gameData, players: [{ id: playerId, position: { x:0, y:1.5, z:0 } }] }));
            } else if (data.type === 'join_room') {
                const room = rooms.get(data.roomId);
                if (!room) return ws.send(JSON.stringify({ type: 'error', message: 'Комната не найдена' }));
                currentRoomId = data.roomId;
                room.players.set(playerId, ws);
                const players = Array.from(room.players.entries()).map(([id]) => ({ id, position: { x:0, y:1.5, z:0 } }));
                ws.send(JSON.stringify({ type: 'joined_room', playerId, roomId: data.roomId, gameData: room.gameData, players }));
                room.players.forEach((pws, pid) => { if (pid !== playerId) pws.send(JSON.stringify({ type: 'player_joined', playerId, position: { x:0, y:1.5, z:0 } })); });
            } else if (data.type === 'update_position') {
                const room = rooms.get(currentRoomId);
                if (room) room.players.forEach((pws, pid) => { if (pid !== playerId) pws.send(JSON.stringify({ type: 'player_moved', playerId, position: data.position })); });
            } else if (data.type === 'leave_room') {
                const room = rooms.get(currentRoomId);
                if (room) {
                    room.players.delete(playerId);
                    room.players.forEach(pws => pws.send(JSON.stringify({ type: 'player_left', playerId })));
                    if (room.players.size === 0) rooms.delete(currentRoomId);
                }
                currentRoomId = null;
            }
        } catch (e) {}
    });

    ws.on('close', () => {
        if (currentRoomId) {
            const room = rooms.get(currentRoomId);
            if (room) {
                room.players.delete(playerId);
                room.players.forEach(pws => pws.send(JSON.stringify({ type: 'player_left', playerId })));
                if (room.players.size === 0) rooms.delete(currentRoomId);
            }
        }
    });
});

setInterval(() => server.clients.forEach(ws => { if (ws.isAlive === false) return ws.terminate(); ws.isAlive = false; ws.ping(); }), 30000);
console.log(`🚀 Сигнальный сервер на ${process.env.PORT || 8080}`);
