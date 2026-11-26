/* TOFAA service worker.
 * Caches only what is safe to share: build assets, fonts, icons and images (same origin).
 * Never caches API calls or page HTML, so signed-in data is never stored on the device or shown to the next user.
 * Bump VERSION to drop every old cache. */
const VERSION = "v1";
const STATIC = `tofaa-static-${VERSION}`;
const IMAGES = `tofaa-images-${VERSION}`;
const SHELL = `tofaa-shell-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const MAX_IMAGES = 80;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll([OFFLINE_URL, "/manifest.webmanifest", "/icons/icon-192.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("tofaa-") && !key.endsWith(`-${VERSION}`)).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => { if (event.data === "SKIP_WAITING") self.skipWaiting(); });

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const refresh = fetch(request).then(async (response) => {
    if (response.ok) {
      await cache.put(request, response.clone());
      if (limit) { const keys = await cache.keys(); if (keys.length > limit) await cache.delete(keys[0]); }
    }
    return response;
  }).catch(() => hit);
  return hit || refresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // an API on another address and Supabase are never cached
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/health")) return; // nor is an API on this address

  if (request.mode === "navigate") {
    // Always go to the network for pages; show the offline page only when there is no connection.
    event.respondWith(fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || /\.(?:woff2?|ttf)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request, STATIC)); // hashed file names: a changed file has a new URL
    return;
  }
  if (url.pathname.startsWith("/_next/image") || request.destination === "image") {
    event.respondWith(staleWhileRevalidate(request, IMAGES, MAX_IMAGES));
  }
});
