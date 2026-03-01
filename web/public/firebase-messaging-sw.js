// Service Worker for FamChat Push Notifications

let messaging = null;

const hasPushManager = 'PushManager' in self;
const hasNotification = 'Notification' in self;

if (hasPushManager && hasNotification) {
  try {
    importScripts(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js'
    );
    importScripts(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js'
    );

    const firebaseConfig = {
      apiKey: 'AIzaSyBZI2zq9o0AcVcHK8tlZg2iPg4Jr7AF8gM',
      authDomain: 'xreact-ae672.firebaseapp.com',
      projectId: 'xreact-ae672',
      storageBucket: 'xreact-ae672.firebasestorage.app',
      messagingSenderId: '983257337319',
      appId: '1:983257337319:web:35c509737a3a3db8fd4142',
    };

    firebase.initializeApp(firebaseConfig);
    messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      const title = payload.notification?.title || 'FamChat';
      const options = {
        body: payload.notification?.body || 'New message',
        icon: '/vite.svg',
        tag: payload.data?.tag || 'famchat-fcm',
        data: {
          url: payload.data?.url || '/',
        },
      };

      return self.registration.showNotification(title, options);
    });
  } catch (error) {
    console.warn('[SW] FCM initialization failed:', error);
  }
}

// Push event (fallback for raw push)
self.addEventListener('push', (event) => {
  let data = {
    title: 'FamChat',
    body: 'New notification',
    icon: '/vite.svg',
    tag: 'famchat-notification',
    data: { url: '/' },
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      tag: data.tag,
      data: data.data,
    })
  );
});

// Notification click → focus existing tab or open new one
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetPath = event.notification.data?.url || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Try to find an existing tab on our origin
        for (const client of clientList) {
          if (new URL(client.url).origin === self.location.origin && 'navigate' in client) {
            client.focus();
            return client.navigate(self.location.origin + targetPath);
          }
        }
        // No existing tab — open a new one
        if (clients.openWindow) {
          return clients.openWindow(targetPath);
        }
      })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());
