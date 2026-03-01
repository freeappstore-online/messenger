import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc, query, where, limit, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { Contact, ContactRequest } from '@famchat/shared';

export function useContacts(userId: string | undefined) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [requests, setRequests] = useState<ContactRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    getDocs(collection(db, 'contacts', userId, 'list')).then(snap => {
      setContacts(snap.docs.map(d => d.data() as Contact));
      setLoading(false);
    });
  }, [userId]);

  // Live-listen to incoming contact requests
  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(collection(db, 'contactRequests', userId, 'inbox'), snap => {
      setRequests(snap.docs.map(d => d.data() as ContactRequest));
    });
    return unsub;
  }, [userId]);

  const addContact = useCallback(async (email: string) => {
    if (!userId) return;
    const q = query(collection(db, 'users'), where('email', '==', email), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) throw new Error('No user found with that email');
    const userDoc = snap.docs[0];
    if (userDoc.id === userId) throw new Error('Cannot add yourself');

    const me = auth.currentUser!;
    const req: ContactRequest = {
      fromUserId: userId,
      fromDisplayName: me.displayName || me.email || userId,
      fromEmail: me.email || '',
      createdAt: Date.now(),
    };
    await setDoc(doc(db, 'contactRequests', userDoc.id, 'inbox', userId), req);
  }, [userId]);

  const acceptRequest = useCallback(async (req: ContactRequest) => {
    if (!userId) return;
    const me = auth.currentUser!;
    const now = Date.now();

    // Add them to my contacts
    const themInMyList: Contact = {
      userId: req.fromUserId,
      displayName: req.fromDisplayName,
      email: req.fromEmail,
      addedAt: now,
    };
    // Add me to their contacts
    const meInTheirList: Contact = {
      userId: userId,
      displayName: me.displayName || me.email || userId,
      email: me.email || '',
      addedAt: now,
    };

    await Promise.all([
      setDoc(doc(db, 'contacts', userId, 'list', req.fromUserId), themInMyList),
      setDoc(doc(db, 'contacts', req.fromUserId, 'list', userId), meInTheirList),
      deleteDoc(doc(db, 'contactRequests', userId, 'inbox', req.fromUserId)),
    ]);

    setContacts(prev => {
      if (prev.some(c => c.userId === req.fromUserId)) return prev;
      return [...prev, themInMyList];
    });
  }, [userId]);

  const declineRequest = useCallback(async (senderId: string) => {
    if (!userId) return;
    await deleteDoc(doc(db, 'contactRequests', userId, 'inbox', senderId));
  }, [userId]);

  const removeContact = useCallback(async (contactUserId: string) => {
    if (!userId) return;
    setContacts(prev => prev.filter(c => c.userId !== contactUserId));
    await deleteDoc(doc(db, 'contacts', userId, 'list', contactUserId));
  }, [userId]);

  return { contacts, requests, loading, addContact, acceptRequest, declineRequest, removeContact };
}
