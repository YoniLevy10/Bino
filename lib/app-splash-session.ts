/** Splash + fresh fetch only on first dashboard entry per browser tab session. */

import { DASHBOARD_CACHE_LEGACY_KEY, DASHBOARD_CACHE_PREFIX, SPLASH_DONE_KEY } from '@/lib/tenant-browser-cache'

export { SPLASH_DONE_KEY }

export function shouldShowAppSplash(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return sessionStorage.getItem(SPLASH_DONE_KEY) !== '1'
  } catch {
    return false
  }
}

export function markAppSplashComplete(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(SPLASH_DONE_KEY, '1')
  } catch {
    /* private mode / quota */
  }
}

/**
 * Skip localStorage SWR cache only on first entry when there is nothing cached yet.
 * With tenant-keyed dashboard caches, "nothing cached" means no v3 dashboard keys
 * and no legacy unkeyed blob.
 */
export function shouldSkipStalePageCache(): boolean {
  if (!shouldShowAppSplash()) return false
  if (typeof window === 'undefined') return true
  try {
    if (localStorage.getItem(DASHBOARD_CACHE_LEGACY_KEY)) return false
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(DASHBOARD_CACHE_PREFIX)) return false
    }
    return true
  } catch {
    return true
  }
}
