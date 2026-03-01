import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import type { ChannelPost } from '@famchat/shared';
import type { WsClient } from '../services/wsClient';

export function useChannelPosts(channelId: string | undefined, wsClient: WsClient) {
  const [posts, setPosts] = useState<ChannelPost[]>([]);

  // Load initial posts from Firestore
  useEffect(() => {
    if (!channelId) return;
    const q = query(
      collection(db, 'channels', channelId, 'posts'),
      orderBy('createdAt', 'desc'),
      limit(100),
    );
    getDocs(q).then(snap => {
      setPosts(snap.docs.map(d => d.data() as ChannelPost).reverse());
    });
  }, [channelId]);

  // Listen for live posts via WS
  useEffect(() => {
    if (!channelId) return;
    return wsClient.onMessage((msg) => {
      if (msg.type === 'channel_post' && msg.channelId === channelId) {
        setPosts(prev => {
          if (prev.some(p => p.id === msg.post.id)) return prev;
          return [...prev, msg.post];
        });
      }
    });
  }, [channelId, wsClient]);

  const sendPost = useCallback((post: ChannelPost) => {
    if (!channelId) return;
    wsClient.send({ type: 'channel_post', channelId, post });
    // Optimistic add
    setPosts(prev => {
      if (prev.some(p => p.id === post.id)) return prev;
      return [...prev, post];
    });
  }, [channelId, wsClient]);

  return { posts, sendPost };
}
