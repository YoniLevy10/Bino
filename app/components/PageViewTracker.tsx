'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { navIdFromPathname } from '@/lib/nav-from-pathname'

/**
 * Fires a lightweight page-view beacon on tenant dashboard navigations.
 * Dedupes same path within 60s in-session to avoid spam on remounts.
 */
export function PageViewTracker() {
  const pathname = usePathname()
  const lastSent = useRef<{ path: string; at: number } | null>(null)

  useEffect(() => {
    const navId = navIdFromPathname(pathname)
    if (!navId) return

    const now = Date.now()
    if (lastSent.current?.path === pathname && now - lastSent.current.at < 60_000) return
    lastSent.current = { path: pathname, at: now }

    void fetchWithTimeout(
      '/api/analytics/page-view',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pathname, nav_id: navId }),
        keepalive: true,
      },
      5_000
    ).catch(() => {
      /* non-blocking */
    })
  }, [pathname])

  return null
}
