self.addEventListener('push', function(event) {
  const data = event.data?.json() ?? {};
  const title = data.title || 'SVOM';
  const options = {
    body: data.body || '',
    icon: '/icon.png',
    badge: '/badge.png',
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = event.notification.data?.url || '/orders';
  clients.openWindow(url);
});
