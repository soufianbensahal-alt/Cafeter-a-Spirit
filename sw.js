const CACHE_NAME = 'spirit-shell-v25';
const APP_SHELL = [
  '/',
  '/index.html',
  '/bootstrap.js',
  '/styles.css',
  '/app.js',
  '/business/business.css',
  '/business/business-view.js',
  '/business/manifest.webmanifest',
  '/manifest.webmanifest',
  '/assets/spirit-logo-header.png',
  '/assets/onboarding-coffee.jpg',
  '/assets/onboarding-order.jpg',
  '/assets/onboarding-spirit.jpg',
  '/assets/just-eat-logo.avif',
  '/assets/uber-eats-logo.png',
  '/assets/glovo-logo.svg',
  '/assets/icons/spirit-192.png',
  '/assets/icons/spirit-512.png',
  '/assets/icons/spirit-maskable-192.png',
  '/assets/icons/spirit-maskable-512.png',
  '/assets/icons/apple-touch-icon.png',
  '/assets/icons/favicon-64.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== 'GET' || requestUrl.origin !== location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          if (!response.ok) throw new Error('Navigation response failed');
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  const isStaticResource = APP_SHELL.includes(requestUrl.pathname)
    || requestUrl.pathname.startsWith('/assets/');
  if (!isStaticResource) return;

  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then((response) => {
        if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
