import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, query, orderBy, getDocs, limitToLast } from 'firebase/firestore';
import { db } from '../firebase';
import { chatDB } from '../chat/db';
import type { WsClient, ServerMessage } from '../services/wsClient';
import type { PlainMessage } from '@famchat/shared';

export type { PlainMessage } from '@famchat/shared';

export function useMessages(convId: string | undefined, wsClient: WsClient) {
  const [messages, setMessages] = useState<PlainMessage[]>([]);
  const seenIds = useRef(new Set<string>());

  // Load from Dexie first (instant), then backfill from Firestore
  useEffect(() => {
    if (!convId) return;
    seenIds.current.clear();
    setMessages([]);

    let cancelled = false;

    (async () => {
      // 1) Load from Dexie (instant, offline-capable)
      try {
        const records = await chatDB.messages
          .where('convId').equals(convId)
          .sortBy('createdAt');
        if (cancelled) return;
        const msgs = records as PlainMessage[];
        for (const m of msgs) seenIds.current.add(m.id);
        if (msgs.length > 0) setMessages(msgs);
      } catch {
        // Dexie unavailable — continue without it
      }

      // 2) Backfill from Firestore, merge into state
      try {
        const q = query(
          collection(db, `conversations/${convId}/messages`),
          orderBy('createdAt', 'asc'),
          limitToLast(100),
        );
        const snap = await getDocs(q);
        if (cancelled) return;
        const firestoreMsgs = snap.docs.map(d => d.data() as PlainMessage);
        for (const m of firestoreMsgs) seenIds.current.add(m.id);
        if (firestoreMsgs.length > 0) setMessages(firestoreMsgs);
        // Save to Dexie in background (don't block state)
        chatDB.messages.bulkPut(firestoreMsgs).catch(() => {});
      } catch {
        // Firestore unavailable — keep Dexie results
      }
    })();

    return () => { cancelled = true; };
  }, [convId]);

  // WS messages for this conversation
  useEffect(() => {
    if (!convId) return;
    return wsClient.onMessage((msg: ServerMessage) => {
      if (msg.type === 'chat') {
        console.log('[useMessages] WS chat', { msgConvId: msg.convId, hookConvId: convId, match: msg.convId === convId, seen: seenIds.current.has(msg.message.id) });
        if (msg.convId === convId) {
          if (!seenIds.current.has(msg.message.id)) {
            seenIds.current.add(msg.message.id);
            chatDB.messages.put(msg.message).catch(() => {});
            setMessages(prev => [...prev, msg.message]);
          }
        }
      }
    });
  }, [convId, wsClient]);

  const receiveMessage = useCallback(
    (msg: PlainMessage) => {
      if (!seenIds.current.has(msg.id)) {
        seenIds.current.add(msg.id);
        chatDB.messages.put(msg).catch(() => {});
        setMessages(prev => [...prev, msg]);
      }
    },
    [],
  );

  const sendMessage = useCallback(
    (msg: PlainMessage, toUserId?: string) => {
      console.log('[useMessages] sendMessage', { id: msg.id, toUserId, convId: msg.convId, wsConnected: wsClient.connected });
      // Optimistic add
      if (!seenIds.current.has(msg.id)) {
        seenIds.current.add(msg.id);
        chatDB.messages.put(msg).catch(() => {});
        setMessages(prev => [...prev, msg]);
      }
      // Send via WS — server persists to Firestore
      if (toUserId) {
        wsClient.send({ type: 'chat', to: toUserId, convId: msg.convId, message: msg });
      } else {
        wsClient.send({ type: 'chat_group', convId: msg.convId, message: msg });
      }
    },
    [wsClient],
  );

  return { messages, sendMessage, receiveMessage };
}
