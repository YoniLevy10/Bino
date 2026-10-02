/**
 * Canonicalize production traffic off *.vercel.app onto https://bino.casa.
 *
 * Users who open the default Vercel production URL
 * (e.g. bino-*-projects.vercel.app) hit Deployment Protection / SSO and get
 * bounced through vercel.com instead of logging into the app.
 *
 * Webhooks / crons / Apple Pay association stay on the legacy alias so Meta/Grow
 * callbacks keep working until they are fully cut over (see docs/DOMAIN.md).
 */

import { BINO_PUBLIC_ORIGIN, isVercelAppOrigin } from '@/lib/public-origin'

const PASSTHROUGH_PREFIXES = [
  '/api/webhook/',
  '/api/cron/',
  '/.well-known/',
] as const

export function isCanonicalHostPassthroughPath(pathname: string): boolean {
  const path = pathname || '/'
  return PASSTHROUGH_PREFIXES.some(
    (prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix)
  )
}

/**
 * When true, middleware should 308 to https://bino.casa + path + query.
 * Preview / local hosts are left alone so PR deployments remain usable.
 */
export function shouldRedirectVercelAppHostToCanonical(params: {
  host: string
  pathname: string
  /** process.env.VERCEL_ENV — production | preview | development */
  vercelEnv?: string | null
  /** process.env.NODE_ENV */
  nodeEnv?: string | null
}): boolean {
  const host = (params.host || '').split(':')[0]?.trim().toLowerCase() || ''
  if (!host) return false
  if (!isVercelAppOrigin(`https://${host}`)) return false

  // Only force-canonical on production deployments. Preview URLs stay for QA.
  const vercelEnv = (params.vercelEnv || '').trim().toLowerCase()
  if (vercelEnv === 'preview' || vercelEnv === 'development') return false
  if (!vercelEnv && (params.nodeEnv || '').trim() !== 'production') return false

  if (isCanonicalHostPassthroughPath(params.pathname || '/')) return false
  return true
}

export function buildCanonicalRedirectUrl(params: {
  pathname: string
  search: string
}): string {
  const path = params.pathname?.startsWith('/') ? params.pathname : `/${params.pathname || ''}`
  const search = params.search || ''
  return `${BINO_PUBLIC_ORIGIN}${path === '/' && !search ? '' : path}${search}`
}
