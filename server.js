const WebSocket = require('ws');
const server = new WebSocket.Server({ port: process.env.PORT || 8080 });
let rooms = new Map();
server.on('connection', ws => {
    const pid = Math.random().toString(36).substring(2,10)+Date.now().toString(36);
    let roomId = null;
    ws.isAlive = true;
    ws.on('pong', () => ws.isAlive = true);
    console.log(`+ ${pid}`);
    ws.on('message', raw => {
        try {
            const d = JSON.parse(raw);
            if (d.type === 'get_rooms') { const list = Array.from(rooms.entries()).map(([id, r]) => ({ id, name: r.name, author: r.author, players: r.players.size })); ws.send(JSON.stringify({ type: 'rooms_list', rooms: list })); }
            else if (d.type === 'create_room') { roomId = Math.random().toString(36).substring(2,10)+Date.now().toString(36); rooms.set(roomId, { name: d.roomName, author: d.author, gameData: d.gameData, players: new Map([[pid, ws]]) }); ws.send(JSON.stringify({ type: 'room_created', roomId })); ws.send(JSON.stringify({ type: 'joined_room', playerId: pid, roomId, gameData: d.gameData, players: [{ id: pid, position: { x:0, y:1.5, z:0 } }] })); }
            else if (d.type === 'join_room') { const r = rooms.get(d.roomId); if (!r) return ws.send(JSON.stringify({ type: 'error', message: 'Комната не найдена' })); roomId = d.roomId; r.players.set(pid, ws); const players = Array.from(r.players.entries()).map(([id]) => ({ id, position: { x:0, y:1.5, z:0 } })); ws.send(JSON.stringify({ type: 'joined_room', playerId: pid, roomId, gameData: r.gameData, players })); r.players.forEach((pws, oid) => { if (oid !== pid) pws.send(JSON.stringify({ type: 'player_joined', playerId: pid, position: { x:0, y:1.5, z:0 } })); }); }
            else if (d.type === 'update_position') { if (roomId) { const r = rooms.get(roomId); if (r) r.players.forEach((pws, oid) => { if (oid !== pid && pws.readyState === WebSocket.OPEN) pws.send(JSON.stringify({ type: 'player_moved', playerId: pid, position: d.position })); }); } }
            else if (d.type === 'leave_room') { if (roomId) { const r = rooms.get(roomId); if (r) { r.players.delete(pid); r.players.forEach(pws => pws.send(JSON.stringify({ type: 'player_left', playerId: pid }))); if (r.players.size === 0) rooms.delete(roomId); } roomId = null; } }
        } catch(e) { console.error(e); }
    });
    ws.on('close', () => { if (roomId) { const r = rooms.get(roomId); if (r) { r.players.delete(pid); r.players.forEach(pws => { if (pws.readyState === WebSocket.OPEN) pws.send(JSON.stringify({ type: 'player_left', playerId: pid })); }); if (r.players.size === 0) rooms.delete(roomId); } } });
});
setInterval(() => server.clients.forEach(ws => { if (ws.isAlive === false) return ws.terminate(); ws.isAlive = false; ws.ping(); }), 30000);
console.log(`Signal server on ${process.env.PORT || 8080}`);
