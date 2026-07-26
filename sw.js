/* PPL Workout Tracker — offline shell cache.
   Bump CACHE when any shell file changes. */
const CACHE = 'ppl-shell-v4';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/storage.js',
  './js/store.js',
  './js/ui.js',
  './js/charts.js',
  './js/calendar.js',
  './js/session.js',
  './js/editor.js',
  './js/templates.js',
  './js/stats.js',
  './js/exercises.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll fails the whole install if one file 404s; add individually instead.
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  // Stale-while-revalidate: instant offline launch from cache, while a fresh
  // copy is fetched in the background so edits show up on the next open.
  e.respondWith(
    caches.match(req).then((hit) => {
      const fresh = fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit || caches.match('./index.html'));
      return hit || fresh;
    })
  );
});
