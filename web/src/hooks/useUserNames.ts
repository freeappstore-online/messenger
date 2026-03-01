import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

// Module-level cache shared across all hook instances
const nameCache = new Map<string, string>();

export function useUserNames(userIds: string[]) {
  const [names, setNames] = useState<Map<string, string>>(() => {
    const initial = new Map<string, string>();
    for (const id of userIds) {
      const cached = nameCache.get(id);
      if (cached) initial.set(id, cached);
    }
    return initial;
  });

  useEffect(() => {
    const missing = userIds.filter(id => !nameCache.has(id));
    if (missing.length === 0) {
      // All cached — just set from cache
      setNames(new Map(userIds.map(id => [id, nameCache.get(id)!])));
      return;
    }

    Promise.all(
      missing.map(id =>
        getDoc(doc(db, 'users', id)).then(snap => {
          const name = snap.exists() ? (snap.data().displayName || snap.data().email || id) : id;
          nameCache.set(id, name);
        })
      )
    ).then(() => {
      setNames(new Map(userIds.map(id => [id, nameCache.get(id) ?? id])));
    });
  }, [userIds.join(',')]);

  return names;
}
