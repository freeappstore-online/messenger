import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  collectionGroup,
  getDocs,
  query,
  where,
  documentId,
  doc,
  setDoc,
  deleteDoc,
  addDoc,
} from 'firebase/firestore';
import { db } from '../firebase';

export interface Channel {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  subscriberCount: number;
  lastPost: string | null;
  lastPostAt: number | null;
  createdAt: number;
}

export function useChannels(userId: string | undefined) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [subscriptions, setSubscriptions] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Load all channels + user's subscriptions
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      const [channelsSnap, subsSnap] = await Promise.all([
        getDocs(collection(db, 'channels')),
        getDocs(query(collectionGroup(db, 'subscribers'), where(documentId(), '==', userId))),
      ]);
      if (cancelled) return;

      setChannels(channelsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Channel)));
      const subs = new Set<string>();
      for (const subDoc of subsSnap.docs) {
        const channelId = subDoc.ref.parent.parent?.id;
        if (channelId) subs.add(channelId);
      }
      setSubscriptions(subs);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const createChannel = useCallback(async (name: string, description: string) => {
    if (!userId) return;
    const data = {
      name, description, ownerId: userId,
      subscriberCount: 1, lastPost: null, lastPostAt: null,
      createdAt: Date.now(),
    };
    const ref = await addDoc(collection(db, 'channels'), data);
    // Auto-subscribe owner
    await setDoc(doc(db, 'channels', ref.id, 'subscribers', userId), { joinedAt: Date.now() });
    const channel = { id: ref.id, ...data };
    setChannels(prev => [channel, ...prev]);
    setSubscriptions(prev => new Set(prev).add(ref.id));
    return channel;
  }, [userId]);

  const subscribe = useCallback(async (channelId: string) => {
    if (!userId) return;
    await setDoc(doc(db, 'channels', channelId, 'subscribers', userId), { joinedAt: Date.now() });
    setSubscriptions(prev => new Set(prev).add(channelId));
  }, [userId]);

  const unsubscribe = useCallback(async (channelId: string) => {
    if (!userId) return;
    await deleteDoc(doc(db, 'channels', channelId, 'subscribers', userId));
    setSubscriptions(prev => {
      const next = new Set(prev);
      next.delete(channelId);
      return next;
    });
  }, [userId]);

  return { channels, subscriptions, loading, createChannel, subscribe, unsubscribe };
}
