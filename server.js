import { WebSocketServer } from 'ws';
import { setupWSConnection } from 'y-websocket/dist/server.cjs.js'; // must use dist/server.cjs.js

const wss = new WebSocketServer({ port: 1234 });

wss.on('connection', (conn, req) => {
  setupWSConnection(conn, req);
});

console.log('Yjs WebSocket server running on ws://localhost:1234');