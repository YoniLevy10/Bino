'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import { dispatchAppRefresh } from '@/lib/app-refresh'
import {
  PWA_HARD_RELOAD_AFTER_MS,
  readHiddenAt,
  shouldHardReloadAfterBackground,
  shouldRefreshAccessToken,
  writeHiddenAt,
} from '@/lib/pwa-session-resume'

/**
 * iOS/Android PWA: the OS suspends JS timers while backgrounded, so Supabase
 * auto-refresh stops and the access token goes stale. On return we must
 * startAutoRefresh + refreshSession, otherwise API calls fail until the user
 * force-kills the home-screen app.
 *
 * After a long background (15m+), do a full reload — network/WebView state is
 * often unrecoverable without deleting the app card.
 */
export function PwaSessionResume() {
  const busyRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const supabase = createClient()

    const onHidden = () => {
      writeHiddenAt(sessionStorage, Date.now())
      try {
        supabase.auth.stopAutoRefresh()
      } catch {
        /* ignore */
      }
    }

    const onVisible = async () => {
      if (busyRef.current) return
      busyRef.current = true
      try {
        const hiddenAt = readHiddenAt(sessionStorage)
        writeHiddenAt(sessionStorage, null)

        if (shouldHardReloadAfterBackground(hiddenAt, Date.now(), PWA_HARD_RELOAD_AFTER_MS)) {
          window.location.reload()
          return
        }

        try {
          supabase.auth.startAutoRefresh()
        } catch {
          /* ignore */
        }

        const { data: sessionData } = await supabase.auth.getSession()
        let session = sessionData.session
        if (!session) {
          // Cookies may still be settling after iOS resume — one soft retry.
          await new Promise((r) => setTimeout(r, 250))
          const again = await supabase.auth.getSession()
          session = again.data.session
          if (!session) {
            // Stay put — middleware will send unauthenticated navigations to /login.
            return
          }
        }

        if (shouldRefreshAccessToken(session.expires_at, Date.now())) {
          const { error } = await supabase.auth.refreshSession()
          if (error) {
            console.warn('[pwa-resume] refreshSession failed', error.message)
          }
        }

        dispatchAppRefresh()
      } finally {
        busyRef.current = false
      }
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHidden()
      else void onVisible()
    }

    const onPageShow = (e: PageTransitionEvent) => {
      // bfcache restore — treat like resume
      if (e.persisted) void onVisible()
    }

    // If we load already visible after a kill, ensure auto-refresh is on.
    if (document.visibilityState === 'visible') {
      try {
        supabase.auth.startAutoRefresh()
      } catch {
        /* ignore */
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [])

  return null
}
