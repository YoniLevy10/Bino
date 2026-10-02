/**
 * Public app URL for SMS / deep links. Set NEXT_PUBLIC_APP_URL in .env.local and Vercel
 * (production: https://bino.casa). Trimmed; trailing slash stripped before appending paths.
 * Never fall back to *.vercel.app for user-facing links.
 */

import { BINO_PUBLIC_ORIGIN, getEnvPublicOrigin } from '@/lib/public-origin'

function getPublicAppBaseUrl(): string {
  const fromEnv = getEnvPublicOrigin()
  if (fromEnv) return fromEnv
  // Required for SMS/WhatsApp deep links in production; fall back to canonical host
  // rather than emitting a *.vercel.app alias if env is missing/mis-set.
  if (!(process.env.NEXT_PUBLIC_APP_URL || '').trim()) {
    throw new Error('NEXT_PUBLIC_APP_URL is not set')
  }
  return BINO_PUBLIC_ORIGIN
}

/** Base URL when optional (e.g. ops alert emails). Empty only if unset; never *.vercel.app. */
export function getPublicAppUrl(): string {
  const fromEnv = getEnvPublicOrigin()
  if (fromEnv) return fromEnv
  if ((process.env.NEXT_PUBLIC_APP_URL || '').trim()) return BINO_PUBLIC_ORIGIN
  return ''
}

export function getPublicTicketsUrl(): string {
  return `${getPublicAppBaseUrl()}/tickets`
}

/** Field worker personal area — no Google login; token saved in sessionStorage after first open. */
export function getWorkerPortalUrl(accessToken: string): string {
  const token = accessToken.trim().toLowerCase()
  return `${getPublicAppBaseUrl()}/worker?token=${encodeURIComponent(token)}`
}

/** NFC / QR scan URL for field worker attendance (project or office tag). */
export function getWorkerAttendanceScanUrl(tagCode: string, accessToken?: string | null): string {
  const base = getPublicAppBaseUrl()
  const params = new URLSearchParams({ t: tagCode.trim() })
  const token = accessToken?.trim()
  if (token) params.set('token', token)
  return `${base}/worker/nfc?${params.toString()}`
}

/** Public Bino-hosted payment landing for a collection charge token. */
export function getPublicPayUrl(publicToken: string): string {
  return `${getPublicAppBaseUrl()}/pay/${encodeURIComponent(publicToken.trim())}`
}
