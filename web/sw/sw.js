// Service worker: offline app shell + the last data the user looked at.
// Built by the `serviceWorker` plugin in vite.config.ts, which fills in VERSION and PRECACHE.
//
// - App shell (index.html, JS, CSS, fonts, icons): precached per build; old builds are dropped.
// - data/meta.json: network first, cached copy when offline. It names the current data build.
// - Other data files are requested as `<file>?v=<meta.built_at>` (see src/lib/data.ts), so a
//   cached copy is valid for as long as that build is current: cache first. When meta.json
//   reports a new build, copies from older builds are deleted.

const VERSION = '__VERSION__'
const PRECACHE = __PRECACHE__
const SHELL = `shell-${VERSION}`
const DATA = 'data'

const scope = new URL(self.registration.scope)
const dataPrefix = `${scope.pathname}data/`
const metaUrl = new URL(`${dataPrefix}meta.json`, scope).href
// Module scripts are requested with an Origin header and servers send `Vary: Origin`; a cached
// file is the same file either way.
const MATCH = { ignoreVary: true }

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL).then((c) => c.addAll(PRECACHE.map((p) => new URL(p, scope).href))),
      // The page fetched meta.json before this worker controlled it; keep a copy for offline.
      caches.open(DATA).then((c) => c.add(metaUrl).catch(() => {})),
    ]).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return

  if (url.pathname === `${dataPrefix}meta.json`) event.respondWith(meta(req))
  else if (url.pathname.startsWith(dataPrefix)) event.respondWith(url.searchParams.has('v') ? cacheFirst(req, DATA) : networkFirst(req, DATA))
  else if (req.mode === 'navigate') event.respondWith(networkFirst(new URL('./', scope).href, SHELL, req))
  else event.respondWith(cacheFirst(req, SHELL))
})

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(req, MATCH)
  if (hit) return hit
  const res = await fetch(req)
  if (res.ok) await cache.put(req, res.clone())
  return res
}

/** `key` is what the response is cached under (the shell for every navigation). */
async function networkFirst(key, cacheName, req = key) {
  const cache = await caches.open(cacheName)
  try {
    const res = await fetch(req)
    if (res.ok) await cache.put(key, res.clone())
    return res
  } catch (err) {
    const hit = await cache.match(key, { ...MATCH, ignoreSearch: true })
    if (hit) return hit
    throw err
  }
}

async function meta(req) {
  const cache = await caches.open(DATA)
  const key = metaUrl
  try {
    const res = await fetch(req)
    if (res.ok) {
      const builtAt = (await res.clone().json()).built_at
      await cache.put(key, res.clone())
      await pruneData(cache, builtAt)
    }
    return res
  } catch (err) {
    const hit = await cache.match(key, MATCH)
    if (hit) return hit
    throw err
  }
}

/** Drop data files cached for an older build. */
async function pruneData(cache, builtAt) {
  if (!builtAt) return
  for (const req of await cache.keys()) {
    const v = new URL(req.url).searchParams.get('v')
    if (v != null && v !== builtAt) await cache.delete(req)
  }
}

