const CACHE_NAME = 'auramusic-v3.29';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.png',
  '/icon-192.png',
  '/icon-512.png',
  '/assets/index-aura3.js',
  '/assets/index-D7KSEyRA.css',
  '/prefetch.v3.js',
  '/freefy-auth.js',
  '/aura-smart.js'
];

// Install: Cache complete app shell for full offline support
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Cache addAll warning:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: Clean up previous cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: Network first for APIs, Cache First with Network Fallback for App Shell & Static Assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Bypass cache for external CDNs, YouTube API, and dynamic API endpoints
  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('saavncdn.com') ||
    url.hostname.includes('googlevideo.com') ||
    url.hostname.includes('youtube.com') ||
    url.hostname.includes('mongodb.net') ||
    url.hostname.includes('lrclib.net')
  ) {
    return; // Direct network
  }

  // Handle HTML navigation: Cache first when offline, network first when online
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() => caches.match('/index.html').then((res) => res || caches.match('/')))
    );
    return;
  }

  // Cache-first strategy for local scripts, css, icons so app opens INSTANTLY offline
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch in background to update cache if online
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Offline fallback for assets
        if (event.request.destination === 'image') {
          return caches.match('/icon-192.png');
        }
      });
    })
  );
});
