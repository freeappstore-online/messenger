import { getUserContacts } from './contacts.js';
import { isOnline, sendTo } from './presence.js';

// Send presence of online contacts to a newly connected user
export async function sendContactPresence(userId: string) {
  try {
    const contacts = await getUserContacts(userId);
    for (const contactId of contacts) {
      if (isOnline(contactId)) {
        sendTo(userId, { type: 'presence', userId: contactId, online: true });
      }
    }
  } catch (err) {
    console.error(`[presence] Failed to send contact presence to ${userId}:`, err);
  }
}
