import { useCallback, useEffect, useState } from 'react';
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface ContactSettings {
  nickname?: string;
  notes?: string;
  mutePush?: boolean;
  muteInApp?: boolean;
  updatedAt?: number;
}

export function useContactSettings(userId: string | undefined) {
  const [settingsByUser, setSettingsByUser] = useState<Map<string, ContactSettings>>(new Map());

  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(collection(db, 'users', userId, 'contactSettings'), (snap) => {
      const next = new Map<string, ContactSettings>();
      for (const d of snap.docs) {
        next.set(d.id, d.data() as ContactSettings);
      }
      setSettingsByUser(next);
    });
    return unsub;
  }, [userId]);

  const saveContactSettings = useCallback(async (contactUserId: string, patch: ContactSettings) => {
    if (!userId) return;
    const data: ContactSettings = { updatedAt: Date.now() };
    if (patch.nickname !== undefined) data.nickname = patch.nickname;
    if (patch.notes !== undefined) data.notes = patch.notes;
    if (patch.mutePush !== undefined) data.mutePush = patch.mutePush;
    if (patch.muteInApp !== undefined) data.muteInApp = patch.muteInApp;
    await setDoc(doc(db, 'users', userId, 'contactSettings', contactUserId), data, { merge: true });
  }, [userId]);

  return { settingsByUser, saveContactSettings };
}
