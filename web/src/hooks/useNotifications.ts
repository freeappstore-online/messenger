import { useEffect, useState } from 'react';
import { hasNotificationPermission } from '../utils/pwa';
import { requestFCMToken, saveFCMToken, setupForegroundMessageHandler } from '../services/fcm';

export function useNotifications(userId: string | undefined) {
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
          const title = payload.notification?.title || 'FamChat';
          const body = payload.notification?.body || 'New message';
          if (document.hidden) return;
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, { body, icon: '/vite.svg' });
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
  }, [userId, permissionGranted]);

  return { permissionGranted, setPermissionGranted };
}
