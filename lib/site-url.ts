/**
 * Canonical site URL for redirects / absolute links (prefer env in prod).
 * Production origin: https://bino.casa (NEXT_PUBLIC_APP_URL on Vercel).
 * Do not use VERCEL_URL / *.vercel.app for customer-facing links.
 */

import {
  BINO_PUBLIC_ORIGIN,
  getEnvPublicOrigin,
  isVercelAppOrigin,
} from '@/lib/public-origin'

type HeaderLike = { get(name: string): string | null }

export function getPublicSiteUrlFromHeaders(headers?: HeaderLike): string {
  const env = getEnvPublicOrigin()
  if (env) return env

  if (!headers) return BINO_PUBLIC_ORIGIN

  const proto = headers.get('x-forwarded-proto') || 'https'
  const host =
    headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    headers.get('host')?.trim() ||
    ''
  if (!host) return BINO_PUBLIC_ORIGIN

  const fromHeaders = `${proto}://${host}`.replace(/\/$/, '')
  if (isVercelAppOrigin(fromHeaders)) return BINO_PUBLIC_ORIGIN
  return fromHeaders
}
