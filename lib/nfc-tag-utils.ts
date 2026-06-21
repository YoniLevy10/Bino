import { getWorkerAttendanceScanUrl } from '@/lib/public-app-url'

/** Canonical tag code stored in DB and used in scan URLs. */
export function normalizeTagCode(code: string): string {
  return code.trim().toUpperCase()
}

export function buildNfcTagScanUrl(tagCode: string): string {
  try {
    return getWorkerAttendanceScanUrl(normalizeTagCode(tagCode))
  } catch {
    return `/worker/nfc?t=${encodeURIComponent(normalizeTagCode(tagCode))}`
  }
}
