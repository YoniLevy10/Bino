/** Splash + fresh fetch only on first dashboard entry per browser tab session. */
const SPLASH_DONE_KEY = 'bamakor_splash_done'

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

const DASHBOARD_CACHE_KEY = 'bamakor_dashboard_v2'

/** Skip localStorage SWR cache only on first entry when there is nothing cached yet. */
export function shouldSkipStalePageCache(): boolean {
  if (!shouldShowAppSplash()) return false
  if (typeof window === 'undefined') return true
  try {
    return !localStorage.getItem(DASHBOARD_CACHE_KEY)
  } catch {
    return true
  }
}
