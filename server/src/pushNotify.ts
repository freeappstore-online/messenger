import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

const db = () => getFirestore();

export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  const tokensSnap = await db().collection(`users/${userId}/fcmTokens`).get();
  if (tokensSnap.empty) return;

  const tokens = tokensSnap.docs.map(d => d.id);

  const message = {
    tokens,
    notification: { title, body },
    data: data || {},
    webpush: {
      fcmOptions: { link: data?.url || '/' },
      notification: { icon: '/favicon-192.png' },
    },
  };

  try {
    const response = await getMessaging().sendEachForMulticast(message);

    // Clean up invalid tokens
    if (response.failureCount > 0) {
      const batch = db().batch();
      let invalidCount = 0;
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const code = resp.error?.code;
          if (
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered'
          ) {
            batch.delete(db().doc(`users/${userId}/fcmTokens/${tokens[idx]}`));
            invalidCount++;
          }
        }
      });
      if (invalidCount > 0) {
        await batch.commit();
        console.log(`[FCM] Removed ${invalidCount} invalid tokens for ${userId}`);
      }
    }
  } catch (error) {
    console.error(`[FCM] Error sending to ${userId}:`, error);
  }
}
