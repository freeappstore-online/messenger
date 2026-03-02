import { useEffect, useState } from 'react';
import { hasNotificationPermission } from '../utils/pwa';
import { requestFCMToken, saveFCMToken, setupForegroundMessageHandler } from '../services/fcm';
import type { ContactSettings } from './useContactSettings';

function getPeerIdFromChatUrl(url: string | undefined, currentUserId: string): string | undefined {
  if (!url || !url.startsWith('/chat/')) return undefined;
  const convId = url.slice('/chat/'.length).split('?')[0];
  const parts = convId.split(':');
  if (parts.length !== 2) return undefined;
  return parts.find((part) => part !== currentUserId);
}

export function useNotifications(
  userId: string | undefined,
  settingsByUser: Map<string, ContactSettings>,
) {
  const [permissionGranted, setPermissionGranted] = useState(hasNotificationPermission);

  useEffect(() => {
    setPermissionGranted(hasNotificationPermission());
  }, []);

  useEffect(() => {
    if (!userId || !permissionGranted) return;

    let cancelled = false;
    let unsubMessage: (() => void) | null = null;

    const setup = async () => {
      try {
        const token = await requestFCMToken();
        if (token && !cancelled) {
          await saveFCMToken(userId, token);
        }
      } catch (error) {
        console.error('[Notifications] Token registration failed:', error);
      }

      try {
        unsubMessage = await setupForegroundMessageHandler((payload) => {
          const peerId = userId ? getPeerIdFromChatUrl(payload.data?.url, userId) : undefined;
          if (peerId && settingsByUser.get(peerId)?.muteInApp) return;
          const title = payload.notification?.title || 'FamChat';
          const body = payload.notification?.body || 'New message';
          if (document.hidden) return;
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, { body, icon: '/favicon-192.png' });
          }
        });
      } catch (error) {
        console.error('[Notifications] Foreground handler failed:', error);
      }
    };

    setup();

    return () => {
      cancelled = true;
      unsubMessage?.();
    };
  }, [userId, permissionGranted, settingsByUser]);

  return { permissionGranted, setPermissionGranted };
}
