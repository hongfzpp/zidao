/* Service worker: makes the app work without a network.

   NETWORK-FIRST, cache as fallback -- deliberately not the usual cache-first.
   A cache-first worker means editing a file and reloading still runs the old
   code, which already cost this project a lot of confused debugging (it is why
   scripts/serve.py sends no-store). Network-first keeps development honest and
   still gives a fully offline app once the iPad has seen everything once.

   It is registered only on real deployments: never on localhost, and never with
   ?dev=1 or ?test=1. */

const MANIFEST = 'sw-assets.json';
let CACHE = 'zidao-v0';

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const manifest = await (await fetch(MANIFEST, { cache: 'no-store' })).json();
      CACHE = 'zidao-' + manifest.version;
      const cache = await caches.open(CACHE);
      // addAll fails the whole install if ONE file 404s; add individually so a
      // single missing asset cannot leave the app with no offline support
      await Promise.all(manifest.assets.map(a =>
        cache.add(new Request(a, { cache: 'reload' })).catch(() => {})));
    } catch (e) { /* offline install: fall back to caching as we go */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keep = CACHE;
    for (const name of await caches.keys()) {
      if (name.startsWith('zidao-') && name !== keep) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (e) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      // an unseen page while offline: fall back to the app itself
      if (req.mode === 'navigate') {
        const shell = await caches.match('index.html', { ignoreSearch: true });
        if (shell) return shell;
      }
      throw e;
    }
  })());
});
