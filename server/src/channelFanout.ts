import { getFirestore } from 'firebase-admin/firestore';
import type { ChannelPost } from './types.js';
import { sendTo, isOnline, getOnlineUsers } from './presence.js';

const db = () => getFirestore();

export async function handleChannelPost(
  fromUserId: string,
  channelId: string,
  post: ChannelPost
) {
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
  const offlineSubs = subscribers.filter(id => !isOnline(id));

  // Pick seeds (up to 5 online subscribers)
  const seeds = onlineSubs.slice(0, 5);
  const nonSeeds = onlineSubs.slice(5);

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
    // No relay needed, just send directly to all online
    for (const sub of onlineSubs) {
      sendTo(sub, { type: 'channel_post', channelId, post });
    }
  }
  // Offline subscribers will sync when they reconnect
}

export function handleRelayReport(
  channelId: string,
  postId: string,
  relayedTo: string[]
) {
  // In Phase 3, we'll track coverage and fill gaps.
  // For now, this is a no-op placeholder.
}
