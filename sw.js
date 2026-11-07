/* PICK UP N GO — service worker
 * - Precaches the app shell for offline use
 * - Network-first for navigations (falls back to cached shell, then offline.html)
 * - Stale-while-revalidate for static assets, fonts and CDN libraries
 * - Never caches Firebase / Firestore API traffic
 */
const VERSION = 'png-v1.3.0';
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

const APP_SHELL = [
  './',
  './index.html',
  './offline.html',
  './manifest.json',
  './css/app.css',
  './js/app.js',
  './js/config.js',
  './js/utils.js',
  './js/store.js',
  './js/cart.js',
  './js/pickup.js',
  './js/whatsapp.js',
  './js/qr.js',
  './js/ui.js',
  './js/pwa.js',
  './js/push.js',
  './js/food-art.js',
  './js/sample-data.js',
  './js/views/customer.js',
  './js/views/admin.js',
  './js/views/staff.js',
  './js/views/shared.js',
  './js/vendor/qrcode-generator.js',
  './js/vendor/jsQR.js',
  './js/vendor/firebase/firebase-app-compat.js',
  './js/vendor/firebase/firebase-auth-compat.js',
  './js/vendor/firebase/firebase-firestore-compat.js',
  './js/vendor/firebase/firebase-storage-compat.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/badge-96.png',
];

const CDN = [];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await cache.addAll(APP_SHELL);
      const rt = await caches.open(RUNTIME);
      await Promise.all(CDN.map((u) => rt.add(new Request(u, { mode: 'no-cors' })).catch(() => {})));
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

const BYPASS = [/\/api\//, /firestore\.googleapis\.com/, /identitytoolkit\.googleapis\.com/, /securetoken\.googleapis\.com/, /firebasestorage\.googleapis\.com/, /wa\.me/, /api\.whatsapp\.com/];

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (BYPASS.some((re) => re.test(url.href))) return;

  // Page navigations: network first, then cached shell, then offline page.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(SHELL);
          cache.put('./index.html', res.clone());
          return res;
        } catch {
          return (await caches.match('./index.html')) || (await caches.match('./offline.html'));
        }
      })()
    );
    return;
  }

  // App code (our own JS/CSS/JSON, not vendor libraries): network-first so a new
  // deploy is used immediately; fall back to the cache when offline or slow.
  const isAppCode = url.origin === location.origin && !url.pathname.includes('/vendor/')
    && /\.(js|css|json)$/.test(url.pathname);
  if (isAppCode) {
    event.respondWith((async () => {
      const cache = await caches.open(SHELL);
      try {
        const res = await Promise.race([
          fetch(req, { cache: 'no-cache' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 4000)),
        ]);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return (await cache.match(req)) || (await caches.match(req)) || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // Vendor libraries, icons, fonts, CDN: stale-while-revalidate.
  const cacheable =
    url.origin === location.origin ||
    /fonts\.(googleapis|gstatic)\.com/.test(url.host) ||
    /cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|www\.gstatic\.com/.test(url.host);
  if (!cacheable) return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      const network = fetch(req)
        .then(async (res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            const cache = await caches.open(url.origin === location.origin ? SHELL : RUNTIME);
            cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(network);
        return cached;
      }
      const res = await network;
      if (res) return res;
      if (req.destination === 'image') {
        return new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#efe6d8"/></svg>', { headers: { 'Content-Type': 'image/svg+xml' } });
      }
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    })()
  );
});

// Allow the page to trigger an immediate update.
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// ---------------------------------------------------------------------------
// Web Push
// ---------------------------------------------------------------------------
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || 'PICK UP N GO';
  const options = {
    body: data.body || 'Ada kemas kini untuk pesanan anda.',
    icon: data.icon || 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    tag: data.tag || 'png-update',
    renotify: true,
    vibrate: [120, 60, 120],
    requireInteraction: !!data.requireInteraction,
    data: { url: data.url || './index.html#/orders' },
    actions: data.url ? [{ action: 'open', title: 'Lihat pesanan' }] : [],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './index.html#/orders', self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const sameApp = wins.find((w) => w.url.startsWith(self.registration.scope));
    if (sameApp) {
      await sameApp.focus();
      sameApp.postMessage({ type: 'navigate', url: target });
      return;
    }
    await self.clients.openWindow(target);
  })());
});

// Browser rotated the subscription: tell open pages so they can re-save it.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    wins.forEach((w) => w.postMessage({ type: 'pushsubscriptionchange' }));
  })());
});
