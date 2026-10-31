const CACHE_NAME = 'world-workshop-shell-v1.3.0-world-workshop-release-20261031-01';
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css?v=world-workshop-release-20261031-01',
  './mobile-pwa.css?v=world-workshop-release-20261031-01',
  './design-polish.css?v=world-workshop-release-20261031-01',
  './app.js?v=world-workshop-release-20261031-01',
  './manifest.json',
  './vendor/mammoth.browser.min.js',
  './vendor/fflate.min.js',
  './archive.js?v=world-workshop-release-20261031-01',
  './assets/pwa/icon.svg',
  './assets/pwa/icon-192.png',
  './assets/pwa/icon-512.png',
  './assets/pwa/apple-touch-icon.png',
  './assets/lomira-chibi-avatar.png?v=20261020-04'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith('world-workshop-shell-') && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin || requestUrl.pathname.endsWith('/sw.js')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        return await caches.match(request)
          || await caches.match(new URL('./index.html', self.registration.scope).href)
          || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch (error) {
      return await caches.match(request)
        || new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});
