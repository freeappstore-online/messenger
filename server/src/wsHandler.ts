import type { WebSocket } from 'ws';
import type { ClientMessage } from './types.js';
import { addUser, removeUser, sendTo } from './presence.js';
import { sendContactPresence } from './presenceContacts.js';
import { routeMessage } from './messageRouter.js';
import { handleChannelPost, handleRelayReport, removeP2PTracking } from './channelFanout.js';
import { ensureUser } from './firestore.js';
import type { DecodedIdToken } from 'firebase-admin/auth';

// Rate limiter: token bucket per connection
const RATE_LIMIT = 10; // messages per second
const RATE_BURST = 20; // max burst

export function createRateLimiter() {
  let tokens = RATE_BURST;
  let lastRefill = Date.now();
  return function consume(): boolean {
    const now = Date.now();
    tokens = Math.min(RATE_BURST, tokens + ((now - lastRefill) / 1000) * RATE_LIMIT);
    lastRefill = now;
    if (tokens < 1) return false;
    tokens--;
    return true;
  };
}

export function handleConnection(ws: WebSocket, user: DecodedIdToken) {
  const userId = user.uid;
  const displayName = user.name || user.email || userId;
  const email = user.email || '';
  const rateLimit = createRateLimiter();

  // Register presence + notify contacts
  addUser(userId, ws);
  ensureUser(userId, displayName, email);
  sendContactPresence(userId);

  ws.on('message', async (data) => {
    // Rate limiting
    if (!rateLimit()) {
      console.warn(`[WS] Rate limited: ${userId}`);
      return;
    }

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
    removeP2PTracking(userId);
    removeUser(userId);
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error for ${userId}:`, err);
    removeP2PTracking(userId);
    removeUser(userId);
  });
}
