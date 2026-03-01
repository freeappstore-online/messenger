import type { WebSocket } from 'ws';
import type { ClientMessage } from './types.js';
import { addUser, removeUser, getOnlineUsers, sendTo } from './presence.js';
import { routeMessage } from './messageRouter.js';
import { handleChannelPost, handleRelayReport } from './channelFanout.js';
import { ensureUser } from './firestore.js';
import type { DecodedIdToken } from 'firebase-admin/auth';

export function handleConnection(ws: WebSocket, user: DecodedIdToken) {
  const userId = user.uid;
  const displayName = user.name || user.email || userId;
  const email = user.email || '';

  // Register presence
  addUser(userId, ws);
  ensureUser(userId, displayName, email);

  // Send current online users to the newly connected client
  for (const uid of getOnlineUsers()) {
    if (uid !== userId) {
      sendTo(userId, { type: 'presence', userId: uid, online: true });
    }
  }

  ws.on('message', async (data) => {
    try {
      const msg: ClientMessage = JSON.parse(data.toString());

      if (msg.type === 'channel_post') {
        await handleChannelPost(userId, msg.channelId, msg.post);
      } else if (msg.type === 'channel_relay') {
        handleRelayReport(msg.channelId, msg.postId, msg.relayedTo);
      } else {
        await routeMessage(userId, msg);
      }
    } catch (err) {
      console.error(`[WS] Error handling message from ${userId}:`, err);
    }
  });

  ws.on('close', () => {
    removeUser(userId);
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error for ${userId}:`, err);
    removeUser(userId);
  });
}
