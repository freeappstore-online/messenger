import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import type { WsClient, ServerMessage } from '../services/wsClient';

export interface Conversation {
  id: string;
  type: '1:1' | 'group';
  members: string[];
  name: string | null;
  lastMessage: string | null;
  lastMessageAt: number | null;
}

export function useConversations(userId: string | undefined, wsClient: WsClient) {
  const [conversations, setConversations] = useState<Conversation[]>([]);

  // Load once on mount / user change
  useEffect(() => {
    if (!userId) return;
    const q = query(
      collection(db, 'conversations'),
      where('members', 'array-contains', userId),
    );
    getDocs(q).then((snap) => {
      const convs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Conversation));
      convs.sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));
      setConversations(convs);
    });
  }, [userId]);

  // Update conversation metadata locally when we see a chat message via WS
  useEffect(() => {
    if (!userId) return;
    return wsClient.onMessage((msg: ServerMessage) => {
      if (msg.type === 'chat') {
        setConversations(prev => {
          const idx = prev.findIndex(c => c.id === msg.convId);
          if (idx >= 0) {
            const updated = { ...prev[idx], lastMessage: msg.message.body, lastMessageAt: msg.message.createdAt };
            const next = [updated, ...prev.filter((_, i) => i !== idx)];
            return next;
          }
          // New conversation we haven't seen — add a stub, it will be filled on next load
          return [{
            id: msg.convId,
            type: '1:1',
            members: [userId, msg.from],
            name: null,
            lastMessage: msg.message.body,
            lastMessageAt: msg.message.createdAt,
          }, ...prev];
        });
      }
    });
  }, [userId, wsClient]);

  return conversations;
}
