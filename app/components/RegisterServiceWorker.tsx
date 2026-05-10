'use client'

import { useEffect } from 'react'

export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return

    navigator.serviceWorker.register('/sw.js').then((registration) => {
      // Detect a waiting SW (new version downloaded but not yet active)
      const notifyWaiting = () => {
        if (registration.waiting) {
          window.dispatchEvent(new CustomEvent('sw-update-waiting'))
        }
      }

      // Already waiting when we registered
      notifyWaiting()

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed') notifyWaiting()
        })
      })
    }).catch(() => {})

    // When SW activates (after SKIP_WAITING), reload to get fresh assets
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload()
    })
  }, [])

  return null
}
