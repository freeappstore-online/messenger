import { useState, useEffect } from 'react';
import { collectionGroup, documentId, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { Contact } from '@famchat/shared';

export function useContactChannels(
  userId: string | undefined,
  contacts: Contact[],
) {
  // channelId -> contactIds subscribed to it
  const [contactsByChannel, setContactsByChannel] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    if (!userId || contacts.length === 0) {
      setContactsByChannel(new Map());
      return;
    }

    let cancelled = false;
    const contactIds = [...new Set(contacts.map((c) => c.userId))];

    (async () => {
      const result = new Map<string, string[]>();
      const chunkSize = 30; // Firestore "in" max

      for (let i = 0; i < contactIds.length; i += chunkSize) {
        const chunk = contactIds.slice(i, i + chunkSize);
        if (chunk.length === 0) continue;
        const subsSnap = await getDocs(
          query(collectionGroup(db, 'subscribers'), where(documentId(), 'in', chunk))
        );
        for (const docSnap of subsSnap.docs) {
          const channelId = docSnap.ref.parent.parent?.id;
          if (!channelId) continue;
          const existing = result.get(channelId) ?? [];
          if (!existing.includes(docSnap.id)) existing.push(docSnap.id);
          result.set(channelId, existing);
        }
      }

      if (!cancelled) setContactsByChannel(result);
    })();

    return () => { cancelled = true; };
  }, [userId, contacts]);

  return { contactsByChannel };
}
