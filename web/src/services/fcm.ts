import { getToken, onMessage } from 'firebase/messaging';
import { doc, setDoc, collection } from 'firebase/firestore';
import { db, getFirebaseMessaging } from '../firebase';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

export async function requestFCMToken(): Promise<string | null> {
  try {
    const messaging = await getFirebaseMessaging();
    if (!messaging || !VAPID_KEY) return null;
    return await getToken(messaging, { vapidKey: VAPID_KEY });
  } catch (error) {
    console.error('[FCM] Error getting token:', error);
    return null;
  }
}

export async function saveFCMToken(userId: string, token: string): Promise<void> {
  const tokenRef = doc(collection(db, `users/${userId}/fcmTokens`), token);
  await setDoc(tokenRef, {
    token,
    createdAt: Date.now(),
    userAgent: navigator.userAgent,
  });
}

export async function setupForegroundMessageHandler(
  onMessageReceived: (payload: { notification?: { title?: string; body?: string }; data?: Record<string, string> }) => void
): Promise<(() => void) | null> {
  const messaging = await getFirebaseMessaging();
  if (!messaging) return null;
  return onMessage(messaging, onMessageReceived);
}
