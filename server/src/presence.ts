import type { WebSocket } from 'ws';
import type { ServerMessage } from './types.js';

// userId -> WebSocket
const online = new Map<string, WebSocket>();

export function addUser(userId: string, ws: WebSocket) {
  online.set(userId, ws);
  broadcast({ type: 'presence', userId, online: true }, userId);
}

export function removeUser(userId: string) {
  online.delete(userId);
  broadcast({ type: 'presence', userId, online: false });
}

export function getSocket(userId: string): WebSocket | undefined {
  return online.get(userId);
}

export function isOnline(userId: string): boolean {
  return online.has(userId);
}

export function getOnlineUsers(): string[] {
  return [...online.keys()];
}

export function sendTo(userId: string, msg: ServerMessage): boolean {
  const ws = online.get(userId);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

function broadcast(msg: ServerMessage, excludeUserId?: string) {
  const data = JSON.stringify(msg);
  for (const [uid, ws] of online) {
    if (uid !== excludeUserId && ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  }
}
