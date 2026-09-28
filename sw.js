/*
 * Unwind service worker.
 *
 * Network first, cache as a fallback, so an edit to the site shows up on the
 * next open instead of being stuck behind an old copy. Also receives the
 * daily push and opens the Review page when the notification is tapped.
 */
const CACHE = 'unwind-v1';
const SHELL = [
  './', './index.html', './extras.js', './extras.css', './review-pick.js', './pwa.js',
  './manifest.webmanifest', './icons/icon-192.png', './icons/badge-96.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(SHELL.map(url => cache.add(url).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, fonts, CDNs: straight to network

  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: req.mode === 'navigate' })
          .then(hit => hit || (req.mode === 'navigate' ? caches.match('./') : undefined))
          .then(hit => hit || new Response('離線中', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }))
      )
  );
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'Unwind';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    tag: data.tag || 'unwind-daily',
    renotify: true,
    data: { url: data.url || './#review' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || './#review', self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find(w => w.url.startsWith(self.registration.scope));
    if (win) {
      win.postMessage({ type: 'open', url: target });
      return win.focus();
    }
    return self.clients.openWindow(target);
  })());
});
