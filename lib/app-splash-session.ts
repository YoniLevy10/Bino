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

/** Skip localStorage SWR cache on first entry while splash runs. */
export function shouldSkipStalePageCache(): boolean {
  return shouldShowAppSplash()
}
