import type { WebSocket } from 'ws';
import type { ServerMessage } from './types.js';
import { getUserContacts } from './contacts.js';

// userId -> WebSocket
const online = new Map<string, WebSocket>();

export function addUser(userId: string, ws: WebSocket) {
  online.set(userId, ws);
  notifyContacts(userId, true);
}

export function removeUser(userId: string) {
  online.delete(userId);
  notifyContacts(userId, false);
}

export function isOnline(userId: string): boolean {
  return online.has(userId);
}

export function sendTo(userId: string, msg: ServerMessage): boolean {
  const ws = online.get(userId);
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
    return true;
  }
  return false;
}

// Only notify contacts of presence changes (not all users)
async function notifyContacts(userId: string, isOnlineNow: boolean) {
  try {
    const contacts = await getUserContacts(userId);
    const msg: ServerMessage = { type: 'presence', userId, online: isOnlineNow };
    for (const contactId of contacts) {
      sendTo(contactId, msg);
    }
  } catch (err) {
    console.error(`[presence] Failed to notify contacts of ${userId}:`, err);
  }
}
