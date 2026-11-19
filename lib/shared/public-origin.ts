/**
 * Canonical public origin for shareable customer links (SMS, WhatsApp, clipboard).
 * Always prefer NEXT_PUBLIC_APP_URL (= https://bino.casa). Never advertise *.vercel.app.
 */

export const BINO_PUBLIC_ORIGIN = 'https://bino.casa'

export function isVercelAppOrigin(value: string): boolean {
  const raw = (value || '').trim()
  if (!raw) return false
  try {
    const host = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.toLowerCase()
    return host === 'vercel.app' || host.endsWith('.vercel.app')
  } catch {
    return /\.vercel\.app\b/i.test(raw)
  }
}

function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/$/, '')
}

/** Env origin when set and not a vercel.app host. */
export function getEnvPublicOrigin(): string {
  if (typeof process === 'undefined') return ''
  const fromSite = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL || '')
  if (fromSite && !isVercelAppOrigin(fromSite)) return fromSite
  const fromApp = normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL || '')
  if (fromApp && !isVercelAppOrigin(fromApp)) return fromApp
  return ''
}

/**
 * Client + server safe public origin for links residents/workers/managers share.
 * Order: env → non-vercel browser origin (localhost ok in dev) → https://bino.casa
 */
export function getClientPublicOrigin(): string {
  const fromEnv = getEnvPublicOrigin()
  if (fromEnv) return fromEnv

  if (typeof window !== 'undefined') {
    const origin = normalizeOrigin(window.location.origin || '')
    if (origin && !isVercelAppOrigin(origin)) return origin
  }

  return BINO_PUBLIC_ORIGIN
}

export function getResidentPortalJoinUrl(projectId: string): string {
  const id = projectId.trim()
  return `${getClientPublicOrigin()}/resident/join/${encodeURIComponent(id)}`
}

export function getResidentPortalAcceptInviteUrl(token: string): string {
  return `${getClientPublicOrigin()}/resident/accept-invite?token=${encodeURIComponent(token.trim())}`
}
