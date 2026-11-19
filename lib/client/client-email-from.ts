/** Platform Resend From for all tenant outbound mail (receipts, etc.). */

export const RESEND_CLIENT_FROM_DOMAIN =
  (typeof process !== 'undefined' && process.env.RESEND_FROM_DOMAIN?.trim()) || 'bino.casa'

const DEFAULT_PLATFORM_FROM = `Bino <noreply@${RESEND_CLIENT_FROM_DOMAIN}>`

/** @deprecated Prefer platform From — kept for launch-checklist UI compatibility. */
export function slugifyClientEmailLocalPart(raw: string | null | undefined): string | null {
  const name = (raw || '').trim()
  if (!name) return null
  const ascii = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40)
  if (ascii.length >= 2) return ascii
  return null
}

/** @deprecated Prefer platform From — kept for launch-checklist UI compatibility. */
export function resolveClientEmailSlug(opts: {
  emailSlug?: string | null
  clientName?: string | null
}): string | null {
  const explicit = (opts.emailSlug || '').trim().toLowerCase()
  if (explicit && /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/.test(explicit)) {
    return explicit
  }
  return slugifyClientEmailLocalPart(opts.clientName)
}

/**
 * Resend `from` for all clients — always platform noreply@bino.casa
 * (or RESEND_FROM_EMAIL when set). Per-client slugs are disabled until
 * the domain is verified and branding is intentionally re-enabled.
 */
export function buildClientResendFrom(_opts?: {
  clientName?: string | null
  emailSlug?: string | null
  domain?: string
}): string {
  return (
    (typeof process !== 'undefined' && process.env.RESEND_FROM_EMAIL?.trim()) ||
    DEFAULT_PLATFORM_FROM
  )
}
