/** Reject identical tag scan within this window (ms). */
export const DUPLICATE_SCAN_WINDOW_MS = 2 * 60 * 1000

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
