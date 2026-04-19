// Service worker for Crypto Lifeguard Web Push notifications.
// Registered by src/push.js on page load. Served from origin root as /push-sw.js.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    if (event.data) data = event.data.json();
  } catch (_) {
    try { data = { title: 'Crypto Lifeguard', body: event.data && event.data.text() }; }
    catch { data = {}; }
  }

  const title = (data.title || 'Crypto Lifeguard').slice(0, 200);
  const options = {
    body: (data.body || '').slice(0, 500),
    icon: '/favicon-192.png',
    badge: '/favicon-192.png',
    tag: data.tag || 'clg-alert',
    data: { url: data.url || '/', token: data.token || '', severity: data.severity || '' },
    requireInteraction: data.severity === 'critical',
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of allClients) {
      try {
        if (client.url && client.focus) {
          await client.focus();
          if (client.navigate) await client.navigate(targetUrl);
          return;
        }
      } catch (_) { /* ignore */ }
    }
    if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
  })());
});
