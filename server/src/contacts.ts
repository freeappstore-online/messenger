import { getFirestore } from 'firebase-admin/firestore';

const db = () => getFirestore();

// Cache contact lists to avoid a Firestore read per signal/presence check
const contactsCache = new Map<string, { contacts: Set<string>; expiresAt: number }>();
const CONTACTS_TTL = 60_000; // 1 minute
const pushMuteCache = new Map<string, { muted: boolean; expiresAt: number }>();
const PUSH_MUTE_TTL = 60_000; // 1 minute

export async function getUserContacts(userId: string): Promise<Set<string>> {
  const cached = contactsCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.contacts;

  const snap = await db().collection(`contacts/${userId}/list`).get();
  const contacts = new Set(snap.docs.map(d => d.id));
  contactsCache.set(userId, { contacts, expiresAt: Date.now() + CONTACTS_TTL });
  return contacts;
}

export async function isContact(userId: string, targetId: string): Promise<boolean> {
  const contacts = await getUserContacts(userId);
  return contacts.has(targetId);
}

export async function isPushMuted(recipientId: string, senderId: string): Promise<boolean> {
  const key = `${recipientId}:${senderId}`;
  const cached = pushMuteCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.muted;

  const snap = await db().doc(`users/${recipientId}/contactSettings/${senderId}`).get();
  const muted = !!snap.data()?.mutePush;
  pushMuteCache.set(key, { muted, expiresAt: Date.now() + PUSH_MUTE_TTL });
  return muted;
}
