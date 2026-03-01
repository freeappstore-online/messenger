import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, query, orderBy, getDocs, limitToLast } from 'firebase/firestore';
import { db } from '../firebase';
import type { WsClient, ServerMessage } from '../services/wsClient';

export interface PlainMessage {
  id: string;
  authorId: string;
  authorName: string;
  convId: string;
  body: string;
  createdAt: number;
}

export function useMessages(convId: string | undefined, wsClient: WsClient) {
  const [messages, setMessages] = useState<PlainMessage[]>([]);
  const seenIds = useRef(new Set<string>());

  // Load messages once from Firestore (no real-time listener to avoid read amplification)
  useEffect(() => {
    if (!convId) return;
    seenIds.current.clear();
    setMessages([]);

    const q = query(
      collection(db, `conversations/${convId}/messages`),
      orderBy('createdAt', 'asc'),
      limitToLast(100),
    );
    getDocs(q).then((snap) => {
      const msgs = snap.docs.map(d => d.data() as PlainMessage);
      for (const m of msgs) seenIds.current.add(m.id);
      setMessages(msgs);
    });
  }, [convId]);

  // All new messages arrive via WS — no Firestore listener needed
  useEffect(() => {
    if (!convId) return;
    return wsClient.onMessage((msg: ServerMessage) => {
      if (msg.type === 'chat' && msg.convId === convId) {
        if (!seenIds.current.has(msg.message.id)) {
          seenIds.current.add(msg.message.id);
          setMessages(prev => [...prev, msg.message]);
        }
      }
    });
  }, [convId, wsClient]);

  const sendMessage = useCallback(
    (msg: PlainMessage, toUserId?: string) => {
      // Optimistic add
      if (!seenIds.current.has(msg.id)) {
        seenIds.current.add(msg.id);
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

  return { messages, sendMessage };
}
