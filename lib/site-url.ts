/**
 * Canonical site URL for redirects / absolute links (prefer env in prod).
 * Production origin: https://bino.tech (NEXT_PUBLIC_APP_URL on Vercel).
 * Do not use VERCEL_URL / *.vercel.app for customer-facing links.
 */

type HeaderLike = { get(name: string): string | null }

function envSiteOrigin(): string {
  if (typeof process === 'undefined') return ''
  const fromSite = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/$/, '')
  if (fromSite) return fromSite
  return (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/$/, '')
}

export function getPublicSiteUrlFromHeaders(headers?: HeaderLike): string {
  const env = envSiteOrigin()
  if (env) return env

  if (!headers) return ''

  const proto = headers.get('x-forwarded-proto') || 'https'
  const host =
    headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    headers.get('host')?.trim() ||
    ''
  if (!host) return ''

  return `${proto}://${host}`.replace(/\/$/, '')
}
