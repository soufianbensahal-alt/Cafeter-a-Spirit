const BUILD_ASSETS = self.__SPIRIT_BUILD_ASSETS__ || {
  shared: ['/', '/index.html', '/startup.js', '/bootstrap.js', '/base.css'],
  customer: [
    '/styles.css',
    '/app.js',
    '/manifest.webmanifest',
    '/assets/spirit-logo-header.png',
    '/assets/onboarding-coffee.jpg',
    '/assets/onboarding-order.jpg',
    '/assets/onboarding-spirit.jpg',
    '/assets/just-eat-logo.avif',
    '/assets/uber-eats-logo.png',
    '/assets/glovo-logo.svg'
  ],
  business: ['/business/business.css', '/business/business-view.js', '/business/manifest.webmanifest'],
  runtime: []
};

const CACHE_VERSION = 'v28';
const CACHE_PREFIX = 'spirit-';
const CACHES = {
  shared: `${CACHE_PREFIX}shared-${CACHE_VERSION}`,
  customer: `${CACHE_PREFIX}customer-${CACHE_VERSION}`,
  business: `${CACHE_PREFIX}business-${CACHE_VERSION}`
};
const SHARED_SHELL = [...new Set(BUILD_ASSETS.shared)];
const CUSTOMER_SHELL = [...new Set(BUILD_ASSETS.customer)];
const BUSINESS_SHELL = [...new Set(BUILD_ASSETS.business)];
const RUNTIME_ASSETS = new Set(BUILD_ASSETS.runtime || []);
const SHELL_ASSETS = new Set([...SHARED_SHELL, ...CUSTOMER_SHELL, ...BUSINESS_SHELL, ...RUNTIME_ASSETS]);
const CUSTOMER_ASSETS = new Set(CUSTOMER_SHELL);
const BUSINESS_ASSETS = new Set(BUSINESS_SHELL);

const cacheForPath = (pathname) => {
  if (BUSINESS_ASSETS.has(pathname) || pathname.startsWith('/business/')) return CACHES.business;
  if (CUSTOMER_ASSETS.has(pathname)) return CACHES.customer;
  return CACHES.shared;
};

const warmShell = async (app) => {
  const isBusiness = app === 'business';
  const cacheName = isBusiness ? CACHES.business : CACHES.customer;
  const shell = isBusiness ? BUSINESS_SHELL : CUSTOMER_SHELL;
  if (!shell.length) return;
  await caches.open(cacheName).then((cache) => cache.addAll(shell));
};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHES.shared).then((cache) => cache.addAll(SHARED_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const currentCaches = new Set(Object.values(CACHES));
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && !currentCaches.has(key))
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'WARM_SHELL') return;
  event.waitUntil(warmShell(event.data.app));
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

  const isStaticResource = SHELL_ASSETS.has(requestUrl.pathname)
    || requestUrl.pathname.startsWith('/assets/');
  if (!isStaticResource) return;

  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then((response) => {
        if (response.ok) {
          caches.open(cacheForPath(requestUrl.pathname))
            .then((cache) => cache.put(event.request, response.clone()));
        }
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
    data: { url: payload.url || '/#quick-access' }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = windows.find((candidate) => new URL(candidate.url).origin === self.location.origin);
    if (client) {
      if ('navigate' in client) await client.navigate(targetUrl);
      return client.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});
