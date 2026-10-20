/* RUMBAI service worker. Generated at build time from pwa/sw.template.js. */
const VERSION = '__VERSION__';
/** URL path the app is served under, e.g. '/' or '/Www/rumbai-app/'. */
const BASE = '__BASE__';
const SHELL_CACHE = `rumbai-shell-${VERSION}`;
const RUNTIME_CACHE = 'rumbai-runtime';
/** Small files needed to start offline. */
const PRECACHE = __PRECACHE__;
/** Every file in this build; runtime-cached files not listed here are stale and pruned. */
const ALL_ASSETS = new Set(__ALL_ASSETS__);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(PRECACHE)));
  // Do not skip waiting: the page asks the user before switching versions.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('rumbai-shell-') && key !== SHELL_CACHE) await caches.delete(key);
      }
      const runtime = await caches.open(RUNTIME_CACHE);
      for (const req of await runtime.keys()) {
        if (!ALL_ASSETS.has(new URL(req.url).pathname)) await runtime.delete(req);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

async function networkFirstNavigation(request) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch {
    const shell = await caches.match(`${BASE}index.html`);
    return shell ?? (await caches.match(`${BASE}offline.html`)) ?? Response.error();
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, res.clone());
  }
  return res;
}

async function staleWhileRevalidate(request) {
  const hit = await caches.match(request);
  const network = fetch(request)
    .then(async (res) => {
      if (res.ok) (await caches.open(RUNTIME_CACHE)).put(request, res.clone());
      return res;
    })
    .catch(() => undefined);
  return hit ?? (await network) ?? Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Model weights and other cross-origin downloads are managed by WebLLM's own cache.
  if (url.origin !== self.location.origin) return;
  // API calls are never cached.
  if (url.pathname.startsWith(`${BASE}api/`)) return;
  // Leave other sites on the same origin (e.g. a neighbouring app on GitHub Pages) alone.
  if (!url.pathname.startsWith(BASE)) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
  } else if (url.pathname.startsWith(`${BASE}assets/`)) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request));
  }
});
