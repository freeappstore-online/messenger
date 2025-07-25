import {
  Firestore, doc, setDoc, onSnapshot, deleteDoc, collection, addDoc,
  getDocs, QuerySnapshot
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';

export interface FirestoreService {
  set<T>(path: string, data: T): Promise<void>;
  add<T>(path: string, data: T): Promise<string>;
  remove(path: string): Promise<void>;
  listenDoc<T>(path: string, cb: (data: T | undefined) => void): () => void;
  listenCollection<T>(path: string, cb: (items: Array<{ id: string; data: T }>) => void): () => void;
  readCollectionOnce<T>(path: string): Promise<Array<{ id: string; data: T }>>;
}

export const createFirestoreService = (db: Firestore): FirestoreService => ({
  async set(path, data) {
    await setDoc(doc(db, path), data as DocumentData);
  },
  async add(path, data) {
    const ref = await addDoc(collection(db, path), data as DocumentData);
    return ref.id;
  },
  async remove(path) {
    await deleteDoc(doc(db, path));
  },
  listenDoc(path, cb) {
    return onSnapshot(doc(db, path), snap => cb(snap.exists() ? (snap.data() as any) : undefined));
  },
  listenCollection(path, cb) {
    return onSnapshot(collection(db, path), (qs: QuerySnapshot) => {
      const out = qs.docs.map(d => ({ id: d.id, data: d.data() as any }));
      cb(out);
    });
  },
  async readCollectionOnce(path) {
    const qs = await getDocs(collection(db, path));
    return qs.docs.map(d => ({ id: d.id, data: d.data() as any }));
  }
});
