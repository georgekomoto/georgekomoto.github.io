// Mileage service worker: precache the shell, serve cached-first, refresh in the background.
const CACHE = 'mileage-v2.0.0';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './css/tokens.css', './css/base.css', './css/trips.css', './css/entry.css', './css/summary.css', './css/settings.css',
  './js/app.js', './js/store.js', './js/format.js', './js/icons.js',
  './js/views/trips.js', './js/views/entry.js', './js/views/summary.js', './js/views/settings.js',
  './icons/icon.svg', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      const network = fetch(req).then((resp) => {
        if (resp && resp.ok && resp.type === 'basic') caches.open(CACHE).then((c) => c.put(req, resp.clone()));
        return resp;
      }).catch(() => cached || (req.mode === 'navigate' ? caches.match('./index.html') : new Response('', { status: 504 })));
      return cached || network;
    }),
  );
});
