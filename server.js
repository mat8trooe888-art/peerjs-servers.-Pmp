const { PeerServer } = require('peer');

const PORT = process.env.PORT || 9000;

const server = PeerServer({
  port: PORT,
  path: '/',
  allow_discovery: true   // позволяет видеть список активных пиров (полезно для отладки)
});

console.log(`PeerJS server running on port ${PORT}`);