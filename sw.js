// Boing Boing service worker — v21
//
// Icons live as data: URIs inside index.html and manifest.webmanifest, so
// the SW only needs to cache those two text files (plus the app shell).
const CACHE = 'boing-boing-v38';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './audio.js',
  'https://fonts.googleapis.com/css2?family=Pacifico&display=swap',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isCode = isSameOrigin && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css'));

  // Network-first for HTML and app code (JS/CSS) so users always get fresh
  // code. Cache fallback only when offline.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html') || isCode) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for icons/fonts/static assets.
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
