/*
 * A complete, versioned snapshot keeps the question banks and grading code in
 * step when offline. For each release that changes the app or its data, bump
 * CACHE_VERSION and the corresponding URLs here and in index.html/app.js.
 * No skipWaiting: an update takes over after the existing windows are closed.
 */
const CACHE_PREFIX = 'icu-study-offline-';
const CACHE_VERSION = 'v1';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const ASSETS = [
  {path: '/', kind: 'html'},
  {path: '/app.js?v=4', kind: 'js'},
  {path: '/core.js?v=4', kind: 'js'},
  {path: '/style.css?v=4', kind: 'css'},
  {path: '/install.js?v=1', kind: 'js'},
  {path: '/questions.json?v=4', kind: 'bank'},
  {path: '/past-papers.json?v=4', kind: 'bank'},
  {path: '/manifest.webmanifest', kind: 'manifest'},
  {path: '/icon.svg', kind: 'svg'},
  {path: '/icons/icon-192.png', kind: 'png'},
  {path: '/icons/icon-512.png', kind: 'png'},
  {path: '/icons/icon-maskable-512.png', kind: 'png'},
  {path: '/icons/apple-touch-icon.png', kind: 'png'},
].map(asset => ({...asset, url: new URL(asset.path, self.location.origin).href}));
const BY_URL = new Map(ASSETS.map(asset => [asset.url, asset]));

async function validate(response, asset) {
  if (!response.ok || response.type === 'opaque') throw new Error('Asset unavailable');
  if (new URL(response.url).origin !== self.location.origin) throw new Error('Unexpected redirect');
  const type = (response.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (asset.kind === 'png') {
    if (type !== 'image/png') throw new Error('Expected PNG');
    const bytes = new Uint8Array(await response.clone().arrayBuffer());
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value)) throw new Error('Invalid PNG');
    return;
  }
  if (asset.kind === 'bank' || asset.kind === 'manifest') {
    if (!['application/json', 'application/manifest+json'].includes(type)) throw new Error('Expected JSON');
    const value = await response.clone().json();
    if (asset.kind === 'bank' && (!Array.isArray(value.questions) || !value.questions.length)) throw new Error('Invalid question bank');
    if (asset.kind === 'manifest' && (!value.name || !Array.isArray(value.icons))) throw new Error('Invalid manifest');
    return;
  }
  const body = await response.clone().text();
  if (asset.kind === 'html') {
    if (type !== 'text/html' || !/<html\b/i.test(body) ||
        !body.includes('app.js?v=4') || !body.includes('style.css?v=4') ||
        !body.includes('install.js?v=1')) throw new Error('Unexpected app version');
    return;
  }
  if (/^\s*(?:<!doctype\s+html|<html\b)/i.test(body)) throw new Error('Unexpected HTML error page');
  if (asset.kind === 'js' && (!['text/javascript', 'application/javascript'].includes(type) || !body.trim())) throw new Error('Expected script');
  if (asset.kind === 'css' && (type !== 'text/css' || !body.trim())) throw new Error('Expected stylesheet');
  if (asset.kind === 'svg' && (type !== 'image/svg+xml' || !/<svg\b/.test(body))) throw new Error('Expected SVG');
}

async function fetchAsset(asset) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(asset.url, {cache: 'reload', credentials: 'same-origin', signal: controller.signal});
    await validate(response, asset);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // A complete cache with this version is immutable. Worker-only fixes may
    // reuse it; content changes must always get a new CACHE_VERSION.
    if (await caches.has(CACHE_NAME)) {
      const existing = await caches.open(CACHE_NAME);
      const present = await Promise.all(ASSETS.map(asset => existing.match(asset.url)));
      if (present.every(Boolean)) return;
      await caches.delete(CACHE_NAME);
    }
    // Fetch and validate everything before writing. A failed download never
    // exposes a partial app snapshot, and leaves the previous release intact.
    const results = await Promise.allSettled(ASSETS.map(fetchAsset));
    if (results.some(result => result.status === 'rejected')) throw new Error('Offline snapshot incomplete');
    const cache = await caches.open(CACHE_NAME);
    const writes = await Promise.allSettled(ASSETS.map((asset, index) => cache.put(asset.url, results[index].value)));
    if (writes.some(result => result.status === 'rejected')) {
      await caches.delete(CACHE_NAME);
      throw new Error('Offline snapshot could not be saved');
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const present = await Promise.all(ASSETS.map(asset => cache.match(asset.url)));
    if (present.some(response => !response)) throw new Error('Offline snapshot incomplete');
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Home-screen launch parameters do not create extra offline copies. Do not
  // intercept arbitrary routes, other versions, or external reference links.
  const canonical = (url.pathname === '/' || url.pathname === '/index.html') && request.mode === 'navigate'
    ? new URL('/', self.location.origin).href : url.href;
  const asset = BY_URL.get(canonical);
  if (!asset) return;
  event.respondWith((async () => {
    const cached = await (await caches.open(CACHE_NAME)).match(asset.url);
    if (cached) return cached;
    // An evicted cache entry can still load online. Do not silently patch one
    // file into an old snapshot from a later release.
    try { return await fetchAsset(asset); } catch { return Response.error(); }
  })());
});
