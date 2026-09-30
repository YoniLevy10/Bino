/** Helpers for PWA / mobile session resume after the OS suspends the WebView. */

export const PWA_HIDDEN_AT_KEY = 'bino_pwa_hidden_at'

/** After this long in background, do a full reload (timers/network often dead). */
export const PWA_HARD_RELOAD_AFTER_MS = 15 * 60 * 1000

export function shouldHardReloadAfterBackground(
  hiddenAtMs: number | null | undefined,
  nowMs: number,
  thresholdMs: number = PWA_HARD_RELOAD_AFTER_MS
): boolean {
  if (hiddenAtMs == null || !Number.isFinite(hiddenAtMs)) return false
  if (hiddenAtMs > nowMs) return false
  return nowMs - hiddenAtMs >= thresholdMs
}

/** Refresh if token is missing expiry or expires within the skew window. */
export function shouldRefreshAccessToken(
  expiresAtSec: number | null | undefined,
  nowMs: number,
  skewMs: number = 60_000
): boolean {
  if (expiresAtSec == null || !Number.isFinite(expiresAtSec)) return true
  return expiresAtSec * 1000 <= nowMs + skewMs
}

export function readHiddenAt(storage: Pick<Storage, 'getItem'> | null | undefined): number | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(PWA_HIDDEN_AT_KEY)
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export function writeHiddenAt(
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null | undefined,
  atMs: number | null
): void {
  if (!storage) return
  try {
    if (atMs == null) storage.removeItem(PWA_HIDDEN_AT_KEY)
    else storage.setItem(PWA_HIDDEN_AT_KEY, String(atMs))
  } catch {
    /* private mode / quota */
  }
}
