/* Bino PWA — v11: avoid offline white screen; serve last warm shell or offline.html */
const CACHE_VERSION = 'bino-v11'
const STATIC_CACHE = `bino-static-${CACHE_VERSION}`
const HTML_CACHE = `bino-html-${CACHE_VERSION}`

/** Static-only precache — do NOT precache Next app routes (HTML without JS = white screen). */
const PRECACHE_URLS = ['/offline.html', '/manifest.json', '/manifest.worker.json', '/apple-icon.png', '/icon.png']

/** Routes that may open offline after the user has loaded them online (warm /_next/static cache). */
const OFFLINE_SHELL_PATHS = ['/dashboard', '/worker', '/worker/nfc', '/tickets']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== STATIC_CACHE && k !== HTML_CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

function isSameOrigin(url) {
  return url.origin === self.location.origin
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/_next/static') ||
    pathname.startsWith('/_next/image') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.woff2') ||
    pathname.endsWith('.woff') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.jpg') ||
    pathname.endsWith('.jpeg') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.svg')
  )
}

function isNavigationRequest(request) {
  return request.mode === 'navigate' || (request.headers.get('accept') || '').includes('text/html')
}

function isWorkerNfcNavigation(pathname) {
  return pathname === '/worker/nfc'
}

function pathOnlyRequest(pathname) {
  return new Request(pathname, { credentials: 'same-origin' })
}

async function putHtml(request, pathname, response) {
  if (!response || !response.ok) return
  const html = await caches.open(HTML_CACHE)
  const copyReq = response.clone()
  const copyPath = response.clone()
  await Promise.all([html.put(request, copyReq), html.put(pathOnlyRequest(pathname), copyPath)])
}

async function hasWarmStaticCache() {
  try {
    const cache = await caches.open(STATIC_CACHE)
    const keys = await cache.keys()
    return keys.some((req) => {
      try {
        return new URL(req.url).pathname.startsWith('/_next/static')
      } catch {
        return false
      }
    })
  } catch {
    return false
  }
}

async function matchHtml(request, pathname) {
  const exact = await caches.match(request)
  if (exact) return exact
  const byPath = await caches.match(pathOnlyRequest(pathname))
  if (byPath) return byPath
  const ignoreSearch = await caches.match(request, { ignoreSearch: true })
  if (ignoreSearch) return ignoreSearch
  return null
}

async function offlineFallbackPage() {
  const off = await caches.match('/offline.html')
  return off || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

/**
 * Offline navigations need a warm JS/CSS cache. Serving HTML alone paints a white screen.
 * Prefer last shell for known routes; otherwise always offline.html.
 */
async function respondOfflineNavigation(request, pathname) {
  const warm = await hasWarmStaticCache()
  if (warm) {
    const cached = await matchHtml(request, pathname)
    if (cached) return cached

    for (const shell of OFFLINE_SHELL_PATHS) {
      if (pathname === shell || pathname.startsWith(shell + '/')) {
        const shellHit = await caches.match(pathOnlyRequest(shell))
        if (shellHit) return shellHit
      }
    }

    // Same app area fallbacks (manager vs worker)
    if (pathname.startsWith('/worker')) {
      const workerShell = await caches.match(pathOnlyRequest('/worker'))
      if (workerShell) return workerShell
    } else {
      const dash = await caches.match(pathOnlyRequest('/dashboard'))
      if (dash) return dash
    }
  }
  return offlineFallbackPage()
}

function cacheFirstNfcShell(request, pathname) {
  const revalidate = () =>
    fetch(request)
      .then(async (res) => {
        if (res.ok) {
          await putHtml(request, pathname, res.clone())
          const forStatic = res.clone()
          caches.open(STATIC_CACHE).then((c) => {
            void c.put(pathOnlyRequest(pathname), forStatic)
          })
        }
        return res
      })
      .catch(() => null)

  return matchHtml(request, pathname).then(async (cached) => {
    if (cached) {
      const warm = await hasWarmStaticCache()
      if (warm) {
        void revalidate()
        return cached
      }
      // Stale HTML without JS chunks — do not white-screen
      const network = await revalidate()
      if (network) return network
      return offlineFallbackPage()
    }
    const network = await revalidate()
    if (network) return network
    return respondOfflineNavigation(request, pathname)
  })
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (!isSameOrigin(url)) return
  if (url.pathname.startsWith('/api/')) return

  if (isNavigationRequest(request)) {
    if (isWorkerNfcNavigation(url.pathname)) {
      event.respondWith(cacheFirstNfcShell(request, url.pathname))
      return
    }

    event.respondWith(
      fetch(request)
        .then(async (res) => {
          if (res.ok) {
            await putHtml(request, url.pathname, res.clone())
          }
          return res
        })
        .catch(() => respondOfflineNavigation(request, url.pathname))
    )
    return
  }

  if (
    isStaticAsset(url.pathname) ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/manifest.worker.json' ||
    url.pathname === '/apple-icon.png' ||
    url.pathname === '/icon.png'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(STATIC_CACHE).then((c) => {
                void c.put(request, copy)
              })
            }
            return res
          })
          .catch(() => new Response('', { status: 503, statusText: 'Offline' }))
      })
    )
  }
})

self.addEventListener('push', (event) => {
  let title = 'Bino'
  let body = ''
  let url = '/tickets'
  let badge = 1
  let tag = 'bino-push'
  try {
    const text = event.data?.text()
    if (text) {
      const j = JSON.parse(text)
      title = j.title || title
      body = j.body || ''
      url = j.url || url
      if (typeof j.badge === 'number' && j.badge > 0) badge = j.badge
      if (j.tag) tag = String(j.tag)
    }
  } catch {
    /* ignore */
  }

  event.waitUntil(
    (async () => {
      try {
        if (self.registration.setAppBadge) {
          await self.registration.setAppBadge(badge)
        } else if (typeof navigator !== 'undefined' && navigator.setAppBadge) {
          await navigator.setAppBadge(badge)
        }
      } catch {
        /* badge API not supported on this device */
      }

      await self.registration.showNotification(title, {
        body,
        data: { url, badge },
        tag,
        renotify: true,
        icon: '/apple-icon.png',
        badge: '/apple-icon.png',
        lang: 'he',
        dir: 'rtl',
        vibrate: [200, 100, 200],
      })
    })()
  )
})

function pathMatchesClient(clientUrl, targetPath) {
  try {
    const path = new URL(clientUrl).pathname
    if (targetPath.startsWith('/worker')) {
      return path === '/worker' || path.startsWith('/worker/')
    }
    return !path.startsWith('/worker')
  } catch {
    return false
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification?.data?.url || '/tickets'
  event.waitUntil(
    (async () => {
      try {
        if (self.registration.clearAppBadge) {
          await self.registration.clearAppBadge()
        }
      } catch {
        /* ignore */
      }
      const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const c of clientList) {
        if (c.url && pathMatchesClient(c.url, target) && 'focus' in c) {
          await c.focus()
          if (target.startsWith('/worker')) {
            c.postMessage({ type: 'WORKER_PUSH_OPEN' })
          } else {
            c.postMessage({ type: 'MANAGER_PUSH_OPEN', url: target })
          }
          return
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target)
    })()
  )
})
