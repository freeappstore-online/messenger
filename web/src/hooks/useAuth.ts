import { useState, useEffect } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  deleteUser,
  type User,
} from 'firebase/auth';
import { auth } from '../firebase';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) {
        // Ensure user profile exists in Firestore so others can find us by email
        const ref = doc(db, 'users', u.uid);
        getDoc(ref).then(snap => {
          if (!snap.exists()) {
            setDoc(ref, {
              displayName: u.displayName || '',
              email: u.email || '',
              createdAt: Date.now(),
            });
          }
        });
      }
    });
  }, []);

  const loginEmail = (email: string, password: string) =>
    signInWithEmailAndPassword(auth, email, password);

  const loginGoogle = () =>
    signInWithPopup(auth, new GoogleAuthProvider());

  const logout = () => signOut(auth);

  const deleteAccount = async () => {
    const u = auth.currentUser;
    if (!u) return;
    // Delete user's Firestore data
    const contactsSnap = await getDocs(collection(db, 'contacts', u.uid, 'list'));
    await Promise.all(contactsSnap.docs.map(d => deleteDoc(d.ref)));
    await deleteDoc(doc(db, 'users', u.uid));
    await deleteUser(u);
  };

  return { user, loading, loginEmail, loginGoogle, logout, deleteAccount };
}
