const CACHE_NAME = 'munten-teller-v2';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
];

const OPENCV_URL = 'https://docs.opencv.org/4.x/opencv.js';
const HEIC2ANY_URL = 'https://unpkg.com/heic2any/dist/heic2any.min.js';

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(CORE_ASSETS);
      try {
        await cache.add(OPENCV_URL);
      } catch (_) {
        // Cross-origin caching can fail on first install; we'll cache on-demand in fetch.
      }

      try {
        await cache.add(HEIC2ANY_URL);
      } catch (_) {
        // Cross-origin caching can fail on first install; we'll cache on-demand in fetch.
      }
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      self.clients.claim();
    })()
  );
});

function isSameOrigin(requestUrl) {
  return requestUrl.origin === self.location.origin;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // For same-origin navigations (HTML pages) use network-first so users get latest version
  if (isSameOrigin(url)) {
    const isNavigation = req.mode === 'navigate' || (req.headers && req.headers.get && req.headers.get('accept') && req.headers.get('accept').includes('text/html')) || url.pathname === '/' || url.pathname.endsWith('index.html');
    if (isNavigation) {
      event.respondWith(
        (async () => {
          const cache = await caches.open(CACHE_NAME);
          try {
            const res = await fetch(req);
            if (res && res.ok) cache.put(req, res.clone());
            return res;
          } catch (err) {
            const cached = await cache.match(req) || await cache.match('./index.html') || await cache.match('./');
            return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
          }
        })()
      );
      return;
    }

    // Cache-first for other same-origin assets
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      })()
    );
    return;
  }

  // Stale-while-revalidate for OpenCV.js
  if (url.href === OPENCV_URL) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        const fetchPromise = fetch(req)
          .then((res) => {
            cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      })()
    );
    return;
  }

  // Stale-while-revalidate for heic2any
  if (url.href === HEIC2ANY_URL) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        const fetchPromise = fetch(req)
          .then((res) => {
            cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      })()
    );
    return;
  }
});
