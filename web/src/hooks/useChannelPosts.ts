import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, getDocs, query, orderBy, limit, where, type QueryConstraint } from 'firebase/firestore';
import { db } from '../firebase';
import { type ChannelPost, type P2PMessage } from '@famchat/shared';
import type { WsClient } from '../services/wsClient';
import { getChannelPosts as getCachedPosts, putChannelPosts } from '../chat/db';

interface P2PFunctions {
  broadcastP2P: (msg: P2PMessage) => void;
  sendToPeer: (peerId: string, msg: P2PMessage) => void;
  onP2PMessage: (handler: (peerId: string, msg: P2PMessage) => void) => () => void;
  connectedPeerIds: string[];
}

export function useChannelPosts(
  channelId: string | undefined,
  wsClient: WsClient,
  p2p?: P2PFunctions,
) {
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const postsRef = useRef<ChannelPost[]>([]);
  postsRef.current = posts;

  const addPosts = useCallback((newPosts: ChannelPost[], cacheChannelId?: string) => {
    setPosts(prev => {
      const existing = new Set(prev.map(p => p.id));
      const toAdd = newPosts.filter(p => !existing.has(p.id));
      if (toAdd.length === 0) return prev;
      const merged = [...prev, ...toAdd].sort((a, b) => a.createdAt - b.createdAt);
      return merged;
    });
    if (cacheChannelId) {
      putChannelPosts(cacheChannelId, newPosts).catch(() => {});
    }
  }, []);

  // Tier 1: Load from Dexie cache
  // Tier 2: P2P sync request
  // Tier 3: Firestore gap-fill
  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;

    (async () => {
      // Tier 1: Dexie cache
      const cached = await getCachedPosts(channelId);
      if (cancelled) return;
      if (cached.length > 0) {
        setPosts(cached);
      }

      const latestCached = cached.length > 0 ? cached[cached.length - 1].createdAt : undefined;

      // Tier 2: P2P sync (if peers available)
      let p2pDone = false;
      if (p2p && p2p.connectedPeerIds.length > 0) {
        const targetPeer = p2p.connectedPeerIds[0];
        p2pDone = await new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => {
            unsub();
            resolve(false);
          }, 2000);

          const unsub = p2p.onP2PMessage((_peerId, msg) => {
            if (msg.type === 'p2p-channel-sync-response' && msg.channelId === channelId) {
              clearTimeout(timeout);
              unsub();
              if (!cancelled && msg.posts.length > 0) {
                addPosts(msg.posts, channelId);
              }
              resolve(true);
            }
          });

          p2p.sendToPeer(targetPeer, {
            type: 'p2p-channel-sync-request',
            channelId,
            sinceTimestamp: latestCached,
          });
        });
      }

      if (cancelled) return;

      // Tier 3: Firestore gap-fill
      // If P2P succeeded and we had cache, skip Firestore
      // Otherwise fetch from Firestore
      if (!p2pDone || cached.length === 0) {
        const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc'), limit(100)];
        if (latestCached && p2pDone) {
          // Only fill the gap
          constraints.unshift(where('createdAt', '>', latestCached));
        }
        const q = query(collection(db, 'channels', channelId, 'posts'), ...constraints);
        const snap = await getDocs(q);
        if (!cancelled) {
          const firestorePosts = snap.docs.map(d => d.data() as ChannelPost).reverse();
          addPosts(firestorePosts, channelId);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [channelId, p2p?.connectedPeerIds.length, addPosts]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset posts when channel changes
  useEffect(() => {
    setPosts([]);
  }, [channelId]);

  // Listen for live posts via WS
  useEffect(() => {
    if (!channelId) return;
    return wsClient.onMessage((msg) => {
      if (msg.type === 'channel_post' && msg.channelId === channelId) {
        addPosts([msg.post], channelId);
      }
    });
  }, [channelId, wsClient, addPosts]);

  // Listen for live P2P posts + respond to sync requests
  useEffect(() => {
    if (!channelId || !p2p) return;
    return p2p.onP2PMessage(async (peerId, msg) => {
      if (msg.type === 'p2p-channel-post' && msg.channelId === channelId) {
        addPosts([msg.post], channelId);
      }
      if (msg.type === 'p2p-channel-sync-request' && msg.channelId === channelId) {
        // Respond with our cached posts
        const cached = await getCachedPosts(channelId, msg.sinceTimestamp);
        p2p.sendToPeer(peerId, {
          type: 'p2p-channel-sync-response',
          channelId,
          posts: cached,
        });
      }
    });
  }, [channelId, p2p, addPosts]);

  const sendPost = useCallback((post: ChannelPost) => {
    if (!channelId) return;
    // Send to WS for persistence
    wsClient.send({ type: 'channel_post', channelId, post });
    // Broadcast to P2P peers
    p2p?.broadcastP2P({ type: 'p2p-channel-post', channelId, post });
    // Optimistic add + cache
    addPosts([post], channelId);
  }, [channelId, wsClient, p2p, addPosts]);

  return { posts, sendPost };
}
