/** Reject accidental double NFC fires within this window (ms). */
export const DUPLICATE_SCAN_WINDOW_MS = 8_000

/**
 * True only for a near-instant re-tap of the same sticker (hardware double-fire).
 * Same sticker after this window must be allowed so clock_in → clock_out works.
 */
export function isDuplicateScan(
  lastTagCode: string | null | undefined,
  lastEventAt: string | null | undefined,
  tagCode: string,
  nowMs: number = Date.now()
): boolean {
  if (!lastTagCode || !lastEventAt) return false
  const prevMs = new Date(lastEventAt).getTime()
  if (!Number.isFinite(prevMs)) return false
  return lastTagCode === tagCode && nowMs - prevMs < DUPLICATE_SCAN_WINDOW_MS
}
