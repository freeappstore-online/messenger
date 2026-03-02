import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, query, orderBy, getDocs, limitToLast } from 'firebase/firestore';
import { db } from '../firebase';
import { chatDB } from '../chat/db';
import type { WsClient, ServerMessage } from '../services/wsClient';
import type { MessageReactions, PlainMessage } from '@famchat/shared';

export type { PlainMessage } from '@famchat/shared';

function toggleReaction(
  current: MessageReactions | undefined,
  emoji: string,
  userId: string,
): MessageReactions {
  const next: MessageReactions = {};
  for (const [key, users] of Object.entries(current ?? {})) {
    const unique = [...new Set(users)].filter(Boolean);
    if (unique.length > 0) next[key] = unique;
  }
  const users = next[emoji] ?? [];
  if (users.includes(userId)) {
    const filtered = users.filter((id) => id !== userId);
    if (filtered.length > 0) next[emoji] = filtered;
    else delete next[emoji];
  } else {
    next[emoji] = [...users, userId];
  }
  return next;
}

export function useMessages(convId: string | undefined, wsClient: WsClient, currentUserId?: string) {
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
        if (firestoreMsgs.length > 0) {
          setMessages((prev) => {
            const merged = new Map<string, PlainMessage>();
            for (const m of prev) merged.set(m.id, m);
            for (const m of firestoreMsgs) {
              const existing = merged.get(m.id);
              merged.set(m.id, existing ? { ...m, attachments: existing.attachments ?? m.attachments, reactions: existing.reactions ?? m.reactions } : m);
            }
            return [...merged.values()].sort((a, b) => a.createdAt - b.createdAt);
          });
        }
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
      } else if (msg.type === 'message_reaction' && msg.convId === convId) {
        setMessages(prev => prev.map((m) => m.id === msg.messageId ? { ...m, reactions: msg.reactions } : m));
        chatDB.messages.update(msg.messageId, { reactions: msg.reactions }).catch(() => {});
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
      // Keep binary image payloads off backend storage.
      if (msg.attachments && msg.attachments.length > 0) {
        console.warn('[useMessages] Attachment message blocked from WS path; use P2P data channel');
        return;
      }
      if (toUserId) {
        wsClient.send({ type: 'chat', to: toUserId, convId: msg.convId, message: msg });
      } else {
        wsClient.send({ type: 'chat_group', convId: msg.convId, message: msg });
      }
    },
    [wsClient],
  );

  const reactToMessage = useCallback((messageId: string, emoji: string) => {
    if (!convId || !currentUserId) return;
    const normalized = emoji.trim();
    if (!normalized) return;

    setMessages((prev) => {
      let nextReactions: MessageReactions | undefined;
      const next = prev.map((m) => {
        if (m.id !== messageId) return m;
        nextReactions = toggleReaction(m.reactions, normalized, currentUserId);
        return { ...m, reactions: nextReactions };
      });
      if (nextReactions) {
        chatDB.messages.update(messageId, { reactions: nextReactions }).catch(() => {});
      }
      return next;
    });

    wsClient.send({ type: 'chat_reaction', convId, messageId, emoji: normalized });
  }, [convId, currentUserId, wsClient]);

  return { messages, sendMessage, receiveMessage, reactToMessage };
}
