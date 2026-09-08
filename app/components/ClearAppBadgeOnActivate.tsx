'use client'

import { useEffect } from 'react'
import { clearAppBadgeBestEffort } from '@/lib/push-client-core'

/**
 * Native App Store behavior: any time the user opens / returns to the app,
 * clear the home-screen icon badge. Mounted in the root layout so it runs
 * on every route (manager, worker, login, etc.) — not only inside AppShell.
 */
export function ClearAppBadgeOnActivate() {
  useEffect(() => {
    const clear = () => {
      void clearAppBadgeBestEffort()
    }

    clear()

    const onVisible = () => {
      if (document.visibilityState === 'visible') clear()
    }
    const onPageShow = () => clear()
    const onFocus = () => clear()

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  return null
}
