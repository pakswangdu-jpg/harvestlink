self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = { message: event.data.text() };
    }
  }

  const title = payload.title || 'HarvestLink';
  const body = payload.message || 'You have a new notification.';
  const targetUrl = typeof payload.link === 'string' && payload.link.startsWith('/') && !payload.link.startsWith('//')
    ? payload.link
    : '/';
  const tag = payload.tag || (payload.id ? `harvestlink-notification-${payload.id}` : 'harvestlink-notification');

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/favicon.png',
      badge: '/favicon.png',
      tag,
      renotify: false,
      data: { url: targetUrl },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const relativePath = event.notification?.data?.url || '/';
  const targetUrl = new URL(relativePath, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          return client.focus().then(() => {
            if ('navigate' in client && client.url !== targetUrl) {
              return client.navigate(targetUrl).catch(() => {});
            }
            return undefined;
          });
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
