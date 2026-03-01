import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { appendFileSync } from 'fs';
import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { verifyToken } from './auth.js';
import { handleConnection } from './wsHandler.js';

const LOG_FILE = '/tmp/famchat-server.log';
const _origLog = console.log;
const _origWarn = console.warn;
const _origErr = console.error;
function fileLog(level: string, args: unknown[]) {
  const line = `[${new Date().toISOString()}] [${level}] ${args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')}\n`;
  try { appendFileSync(LOG_FILE, line); } catch {}
}
console.log = (...args: unknown[]) => { _origLog(...args); fileLog('LOG', args); };
console.warn = (...args: unknown[]) => { _origWarn(...args); fileLog('WARN', args); };
console.error = (...args: unknown[]) => { _origErr(...args); fileLog('ERR', args); };

// Initialize Firebase Admin
initializeApp({
  credential: applicationDefault(),
  projectId: 'xreact-ae672',
});

const PORT = parseInt(process.env.PORT || '8082', 10);

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

server.on('upgrade', async (req, socket, head) => {
  console.log('[upgrade] incoming WS upgrade request');
  // Extract token from query string: ws://host/?token=xxx
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  if (!token) {
    console.log('[upgrade] no token — rejecting');
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  console.log('[upgrade] verifying token...');
  const user = await verifyToken(token);
  if (!user) {
    console.log('[upgrade] invalid token — rejecting');
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  console.log('[upgrade] authenticated:', user.uid, user.email);
  wss.handleUpgrade(req, socket, head, (ws) => {
    handleConnection(ws, user);
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
