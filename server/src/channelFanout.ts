import { getFirestore } from 'firebase-admin/firestore';
import type { ChannelPost, SignalPayload } from './types.js';
import { sendTo, isOnline } from './presence.js';
import { sendPushToUser } from './pushNotify.js';

const db = () => getFirestore();

// Track P2P channel connections: Map<userId, Set<peerId>>
const p2pPeers = new Map<string, Set<string>>();

export function trackP2PSignal(fromUserId: string, toUserId: string, payload: SignalPayload) {
  if (payload.type === 'dc-ready' && payload.connectionId?.startsWith('ch-')) {
    // Mark both sides as P2P-connected for channel sync
    if (!p2pPeers.has(fromUserId)) p2pPeers.set(fromUserId, new Set());
    p2pPeers.get(fromUserId)!.add(toUserId);
    if (!p2pPeers.has(toUserId)) p2pPeers.set(toUserId, new Set());
    p2pPeers.get(toUserId)!.add(fromUserId);
  }
}

export function removeP2PTracking(userId: string) {
  const peers = p2pPeers.get(userId);
  if (peers) {
    for (const peerId of peers) {
      p2pPeers.get(peerId)?.delete(userId);
    }
    p2pPeers.delete(userId);
  }
}

export async function handleChannelPost(
  fromUserId: string,
  channelId: string,
  post: ChannelPost
) {
  // Validate body size
  if (typeof post.body !== 'string' || post.body.length > 10_000) {
    console.warn(`[channel] rejected: body too large from ${fromUserId}`);
    return;
  }
  if (post.attachments && post.attachments.length > 0) {
    console.warn(`[channel] rejected: attachment payload over WS from ${fromUserId}`);
    return;
  }

  // Enforce authorId
  post.authorId = fromUserId;

  // Verify sender is the channel owner
  const channelDoc = await db().doc(`channels/${channelId}`).get();
  if (!channelDoc.exists || channelDoc.data()?.ownerId !== fromUserId) {
    console.warn(`[channel] rejected: ${fromUserId} is not owner of ${channelId}`);
    return;
  }

  // Persist post
  await db().doc(`channels/${channelId}/posts/${post.id}`).set(post);
  await db().doc(`channels/${channelId}`).update({
    lastPost: post.body,
    lastPostAt: post.createdAt,
  });

  // Get all subscribers
  const subsSnap = await db().collection(`channels/${channelId}/subscribers`).get();
  const subscribers = subsSnap.docs.map(d => d.id).filter(id => id !== fromUserId);

  // Find online subscribers
  const onlineSubs = subscribers.filter(id => isOnline(id));

  // Determine which subscribers are P2P-connected to the author
  const authorPeers = p2pPeers.get(fromUserId) ?? new Set<string>();

  // Subscribers covered by P2P (they'll get the post directly from the author)
  const p2pCovered = new Set<string>();
  for (const sub of onlineSubs) {
    if (authorPeers.has(sub)) {
      p2pCovered.add(sub);
    }
  }

  // Send via WS only to uncovered subscribers
  const uncovered = onlineSubs.filter(id => !p2pCovered.has(id));

  // Pick seeds (up to 5 online uncovered subscribers)
  const seeds = uncovered.slice(0, 5);
  const nonSeeds = uncovered.slice(5);

  if (seeds.length > 0 && nonSeeds.length > 0) {
    // Distribute targets among seeds
    const targetsPerSeed = Math.ceil(nonSeeds.length / seeds.length);
    for (let i = 0; i < seeds.length; i++) {
      const targets = nonSeeds.slice(i * targetsPerSeed, (i + 1) * targetsPerSeed);
      // Send the post to the seed
      sendTo(seeds[i], { type: 'channel_post', channelId, post });
      // Ask seed to relay to targets
      if (targets.length > 0) {
        sendTo(seeds[i], { type: 'channel_relay_request', channelId, post, targets });
      }
    }
  } else {
    // No relay needed, just send directly to all uncovered online
    for (const sub of uncovered) {
      sendTo(sub, { type: 'channel_post', channelId, post });
    }
  }
  // Push notifications to offline subscribers
  const offlineSubs = subscribers.filter(id => !isOnline(id));
  if (offlineSubs.length > 0) {
    const preview = post.body.length > 100 ? post.body.slice(0, 100) + '...' : post.body;
    const channelName = channelDoc.data()?.name || 'channel';
    for (const sub of offlineSubs) {
      sendPushToUser(sub, `New post in ${channelName}`, `${post.authorName}: ${preview}`, {
        url: `/channel/${channelId}`,
        tag: `channel-${channelId}`,
      }).catch(err => console.error('[push] channel push failed:', err));
    }
  }
}

export function handleRelayReport(
  channelId: string,
  postId: string,
  relayedTo: string[]
) {
  // In Phase 3, we'll track coverage and fill gaps.
  // For now, this is a no-op placeholder.
}
