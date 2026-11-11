// Service Worker for handling notifications
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(clients.claim());
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event.notification.tag);
  event.notification.close();

  // Open the app or focus existing window
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return clients.openWindow('/');
    })
  );
});

// Handle messages from the main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, icon, tag } = event.data;

    self.registration.showNotification(title, {
      body: body,
      icon: icon || '/favicon.ico',
      badge: icon || '/favicon.ico',
      tag: tag || 'checkpoint-notification',
      vibrate: [200, 100, 200, 100, 200],
      requireInteraction: false,
      silent: false,
      actions: [
        {
          action: 'view',
          title: 'View Mission'
        }
      ]
    });
  }
});
