import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { verifyToken } from './auth.js';
import { handleConnection } from './wsHandler.js';

// Initialize Firebase Admin
initializeApp({
  credential: applicationDefault(),
});

const PORT = parseInt(process.env.PORT || '8080', 10);

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', async (req, socket, head) => {
  // Extract token from query string: ws://host/?token=xxx
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  if (!token) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  const user = await verifyToken(token);
  if (!user) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    handleConnection(ws, user);
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
