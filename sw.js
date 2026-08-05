const CACHE_NAME = 'spirit-shell-v27';
const APP_SHELL = [
  '/',
  '/index.html',
  '/bootstrap.js',
  '/startup.js',
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

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() ?? '' };
  }

  const title = payload.title || 'Spirit Coffee';
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || 'Accede a tus accesos rápidos desde Spirit Coffee.',
    icon: payload.icon || '/assets/icons/spirit-192.png',
    badge: payload.badge || '/assets/icons/favicon-64.png',
    tag: payload.tag || 'spirit-notification',
    renotify: false,
    data: {
      url: payload.url || '/#quick-access'
    }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });
    const client = windows.find((candidate) => new URL(candidate.url).origin === self.location.origin);
    if (client) {
      if ('navigate' in client) await client.navigate(targetUrl);
      return client.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});
