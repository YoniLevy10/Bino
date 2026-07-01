/* Bamakor PWA — v5: worker attendance offline shell (/worker, /worker/nfc) */
const CACHE_VERSION = 'bamakor-v6'
const STATIC_CACHE = `bamakor-static-${CACHE_VERSION}`
const HTML_CACHE = `bamakor-html-${CACHE_VERSION}`
const PRECACHE_URLS = ['/offline.html', '/manifest.json', '/apple-icon.png']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
    // No skipWaiting() — let the app decide when to activate (shows update banner)
  )
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

// When the app sends SKIP_WAITING, activate this SW immediately
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

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (!isSameOrigin(url)) return
  if (url.pathname.startsWith('/api/')) return

  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone()
          if (res.ok) {
            caches.open(HTML_CACHE).then((c) => c.put(request, copy))
          }
          return res
        })
        .catch(() =>
          caches.match(request).then((cached) => {
            if (cached) return cached
            return caches.match('/offline.html').then((off) => off || Response.error())
          })
        )
    )
    return
  }

  if (isStaticAsset(url.pathname) || url.pathname === '/manifest.json' || url.pathname === '/apple-icon.png') {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((res) => {
          const copy = res.clone()
          if (res.ok) {
            caches.open(STATIC_CACHE).then((c) => c.put(request, copy))
          }
          return res
        })
      })
    )
    return
  }
})

self.addEventListener('push', (event) => {
  let title = 'במקור — אזור עובד'
  let body = ''
  let url = '/worker'
  let badge = 1
  let tag = 'worker-assign'
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

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification?.data?.url || '/worker'
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
        if (c.url && c.url.includes('/worker') && 'focus' in c) {
          await c.focus()
          c.postMessage({ type: 'WORKER_PUSH_OPEN' })
          return
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target)
    })()
  )
})
