import { useEffect, useRef, useState } from 'react';
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
  const settingsRef = useRef(settingsByUser);
  const savedTokenByUserRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    setPermissionGranted(hasNotificationPermission());
  }, []);

  useEffect(() => {
    settingsRef.current = settingsByUser;
  }, [settingsByUser]);

  // Register token only when user/permission changes to avoid duplicate writes.
  useEffect(() => {
    if (!userId || !permissionGranted) return;
    let cancelled = false;

    const registerToken = async () => {
      try {
        const token = await requestFCMToken();
        if (token && !cancelled) {
          const existing = savedTokenByUserRef.current.get(userId);
          if (existing === token) return;
          await saveFCMToken(userId, token);
          savedTokenByUserRef.current.set(userId, token);
        }
      } catch (error) {
        console.error('[Notifications] Token registration failed:', error);
      }
    };

    registerToken();
    return () => { cancelled = true; };
  }, [userId, permissionGranted]);

  useEffect(() => {
    if (!userId || !permissionGranted) return;
    let unsubMessage: (() => void) | null = null;

    const setupHandler = async () => {
      try {
        unsubMessage = await setupForegroundMessageHandler((payload) => {
          const senderId = payload.data?.senderId ?? getPeerIdFromChatUrl(payload.data?.url, userId);
          if (senderId && settingsRef.current.get(senderId)?.muteInApp) return;
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

    setupHandler();

    return () => {
      unsubMessage?.();
    };
  }, [userId, permissionGranted]);

  return { permissionGranted, setPermissionGranted };
}
