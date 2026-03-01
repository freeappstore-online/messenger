import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export interface Conversation {
  id: string;
  type: '1:1' | 'group';
  members: string[];
  name: string | null;
  lastMessage: string | null;
  lastMessageAt: number | null;
}

export function useConversations(userId: string | undefined) {
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    if (!userId) return;
    const q = query(
      collection(db, 'conversations'),
      where('members', 'array-contains', userId),
    );
    return onSnapshot(q, (snap) => {
      const convs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Conversation));
      convs.sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));
      setConversations(convs);
    });
  }, [userId]);

  return conversations;
}
