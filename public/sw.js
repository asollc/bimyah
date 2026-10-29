/* Bimyah service worker: web push + PWA installability.
   No offline caching: the game is live and account-driven, always network. */
const ICON = '/favicon-512.png';
const BADGE = '/favicon-32.png';

self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });

// Pass-through fetch keeps the installability requirement satisfied
// without ever serving stale content.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request));
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: String(e.data || '') }; }
  const title = d.title || 'Bimyah!';
  const options = {
    body: d.body || '',
    icon: ICON,
    badge: BADGE,
    tag: d.tag || 'bimyah-push',
    // Every push is a distinct alert: it must buzz even when it replaces an
    // earlier notification with the same tag.
    renotify: true,
    data: { url: d.url || '/' },
  };
  if (d.image) options.image = d.image;
  e.waitUntil((async () => {
    try {
      if ('setAppBadge' in navigator) {
        if (d.badge) await navigator.setAppBadge(d.badge);
        else await navigator.setAppBadge();
      }
    } catch (err) { /* badging unsupported - the notification still shows */ }
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  try { if ('clearAppBadge' in navigator) navigator.clearAppBadge(); } catch (err) { /* ignore */ }
  const target = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin);
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        try {
          if (new URL(w.url).origin === target.origin) { w.navigate(target.href); return w.focus(); }
        } catch (err) { /* ignore */ }
      }
      return self.clients.openWindow(target.href);
    })
  );
});
