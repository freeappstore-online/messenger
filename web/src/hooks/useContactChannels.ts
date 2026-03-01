import { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import type { Contact } from '@famchat/shared';

export function useContactChannels(
  userId: string | undefined,
  contacts: Contact[],
  subscriptions: Set<string>,
) {
  // channelId -> contactIds subscribed to it
  const [contactsByChannel, setContactsByChannel] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    if (!userId || contacts.length === 0 || subscriptions.size === 0) {
      setContactsByChannel(new Map());
      return;
    }

    let cancelled = false;
    const contactIds = new Set(contacts.map(c => c.userId));

    (async () => {
      // Fetch all channels' subscriber lists
      const channelsSnap = await getDocs(collection(db, 'channels'));
      const result = new Map<string, string[]>();

      await Promise.all(
        channelsSnap.docs.map(async (ch) => {
          const subsSnap = await getDocs(collection(db, 'channels', ch.id, 'subscribers'));
          const contactSubs = subsSnap.docs
            .map(d => d.id)
            .filter(id => contactIds.has(id));
          if (contactSubs.length > 0) {
            result.set(ch.id, contactSubs);
          }
        }),
      );

      if (!cancelled) setContactsByChannel(result);
    })();

    return () => { cancelled = true; };
  }, [userId, contacts, subscriptions]);

  return { contactsByChannel };
}
