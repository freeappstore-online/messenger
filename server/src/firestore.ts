import { getFirestore } from 'firebase-admin/firestore';
import type { MessageReactions, PlainMessage } from './types.js';

const db = () => getFirestore();

// Cache known users to avoid a read on every WS connect
const knownUsers = new Set<string>();

export async function ensureUser(userId: string, displayName: string, email: string) {
  if (knownUsers.has(userId)) return;
  const ref = db().doc(`users/${userId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ displayName, email, createdAt: Date.now() });
  }
  knownUsers.add(userId);
}

// Cache conversation members to avoid a read on every group message
const membersCache = new Map<string, { members: string[]; expiresAt: number }>();
const MEMBERS_TTL = 60_000; // 1 minute

export async function saveMessage(msg: PlainMessage) {
  // Batch the message write + conversation metadata update into one round trip
  const batch = db().batch();
  batch.set(db().doc(`conversations/${msg.convId}/messages/${msg.id}`), msg);
  batch.update(db().doc(`conversations/${msg.convId}`), {
    lastMessage: msg.body,
    lastMessageAt: msg.createdAt,
    updatedAt: msg.createdAt,
  });
  await batch.commit();
}

export async function toggleMessageReaction(
  convId: string,
  messageId: string,
  userId: string,
  emoji: string,
): Promise<MessageReactions | null> {
  const msgRef = db().doc(`conversations/${convId}/messages/${messageId}`);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(msgRef);
    if (!snap.exists) return null;

    const data = snap.data() as PlainMessage;
    const prev: MessageReactions = data.reactions ?? {};
    const next: MessageReactions = {};

    for (const [key, users] of Object.entries(prev)) {
      const unique = [...new Set(users)].filter((id): id is string => Boolean(id));
      if (unique.length > 0) next[key] = unique;
    }

    const currentUsers = next[emoji] ?? [];
    if (currentUsers.includes(userId)) {
      next[emoji] = currentUsers.filter((id) => id !== userId);
      if (next[emoji].length === 0) delete next[emoji];
    } else {
      next[emoji] = [...currentUsers, userId];
    }

    tx.update(msgRef, { reactions: next });
    return next;
  });
}

export async function getConversationMembers(convId: string): Promise<string[]> {
  const cached = membersCache.get(convId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.members;
  }
  const snap = await db().doc(`conversations/${convId}`).get();
  const data = snap.data();
  const members = data?.members ?? [];
  membersCache.set(convId, { members, expiresAt: Date.now() + MEMBERS_TTL });
  return members;
}

export async function getMessagesSince(convId: string, since: number): Promise<PlainMessage[]> {
  const snap = await db()
    .collection(`conversations/${convId}/messages`)
    .where('createdAt', '>', since)
    .orderBy('createdAt')
    .limit(500)
    .get();
  return snap.docs.map(d => d.data() as PlainMessage);
}

export async function getUserConversations(userId: string): Promise<string[]> {
  const snap = await db()
    .collection('conversations')
    .where('members', 'array-contains', userId)
    .get();
  return snap.docs.map(d => d.id);
}
