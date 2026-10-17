'use client'

import { useEffect } from 'react'

/** Activate a waiting worker without showing an in-app update banner. */
function activateWaiting(registration: ServiceWorkerRegistration) {
  if (registration.waiting) {
    registration.waiting.postMessage('SKIP_WAITING')
  }
}

export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        activateWaiting(registration)

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (!newWorker) return
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed') activateWaiting(registration)
          })
        })
      })
      .catch(() => {})

    // New SW takes control; apply on next navigation — no banner, no forced reload.
  }, [])

  return null
}
