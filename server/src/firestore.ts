import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { PlainMessage } from './types.js';

const db = () => getFirestore();

export async function ensureUser(userId: string, displayName: string, email: string) {
  const ref = db().doc(`users/${userId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set({ displayName, email, createdAt: Date.now() });
  }
}

export async function getOrCreateConversation(
  members: string[],
  type: '1:1' | 'group',
  name: string | null = null
): Promise<string> {
  // For 1:1, derive a deterministic ID
  if (type === '1:1') {
    const sorted = [...members].sort();
    const convId = sorted.join(':');
    const ref = db().doc(`conversations/${convId}`);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({ type, members: sorted, name, lastMessage: null, lastMessageAt: null, updatedAt: Date.now() });
    }
    return convId;
  }
  // For groups, create with auto-ID
  const ref = await db().collection('conversations').add({
    type, members, name, lastMessage: null, lastMessageAt: null, updatedAt: Date.now()
  });
  return ref.id;
}

export async function saveMessage(msg: PlainMessage) {
  const ref = db().doc(`conversations/${msg.convId}/messages/${msg.id}`);
  await ref.set(msg);
  // Update conversation metadata
  await db().doc(`conversations/${msg.convId}`).update({
    lastMessage: msg.body,
    lastMessageAt: msg.createdAt,
    updatedAt: msg.createdAt,
  });
}

export async function getConversationMembers(convId: string): Promise<string[]> {
  const snap = await db().doc(`conversations/${convId}`).get();
  const data = snap.data();
  return data?.members ?? [];
}

export async function getMessagesSince(convId: string, since: number): Promise<PlainMessage[]> {
  const snap = await db()
    .collection(`conversations/${convId}/messages`)
    .where('createdAt', '>', since)
    .orderBy('createdAt')
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
