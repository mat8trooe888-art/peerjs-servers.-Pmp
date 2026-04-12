const WebSocket = require('ws');

const server = new WebSocket.Server({ port: process.env.PORT || 8080 });

let rooms = new Map();

function heartbeat() {
    this.isAlive = true;
}

server.on('connection', (ws) => {
    const playerId = Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    let currentRoomId = null;
    ws.isAlive = true;
    ws.on('pong', heartbeat);
    
    console.log(`✅ Игрок ${playerId} подключился`);

    ws.on('message', (rawMessage) => {
        try {
            const data = JSON.parse(rawMessage);
            
            switch (data.type) {
                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;
                // ... остальные case без изменений ...
            }
        } catch (err) { console.error('Ошибка парсинга:', err); }
    });
    
    ws.on('close', () => {
        console.log(`❌ Игрок ${playerId} отключился`);
        if (currentRoomId) {
            const room = rooms.get(currentRoomId);
            if (room) {
                room.players.delete(playerId);
                room.players.forEach((playerWs) => {
                    if (playerWs.readyState === WebSocket.OPEN) {
                        playerWs.send(JSON.stringify({ type: 'player_left', playerId: playerId }));
                    }
                });
                if (room.players.size === 0) rooms.delete(currentRoomId);
            }
        }
    });
    
    ws.on('error', (err) => {
        console.error(`Ошибка WebSocket игрока ${playerId}:`, err);
    });
});

// Периодическая проверка живых соединений
const interval = setInterval(() => {
    server.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

server.on('close', () => clearInterval(interval));

console.log(`🚀 Сигнальный сервер на порту ${process.env.PORT || 8080}`);
