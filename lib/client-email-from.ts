/** Per-tenant Resend From: Display Name <slug@bino.casa> */

export const RESEND_CLIENT_FROM_DOMAIN =
  (typeof process !== 'undefined' && process.env.RESEND_FROM_DOMAIN?.trim()) || 'bino.casa'

const HEBREW_SLUG_HINTS: Record<string, string> = {
  סביון: 'savion',
  במקור: 'bamakor',
  במקאור: 'bamakor',
}

/** ASCII local-part for client From address (a-z0-9, hyphen). */
export function slugifyClientEmailLocalPart(raw: string | null | undefined): string | null {
  const name = (raw || '').trim()
  if (!name) return null

  const hinted = HEBREW_SLUG_HINTS[name]
  if (hinted) return hinted

  // Strip Hebrew/diacritics → keep latin digits
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
 * Build Resend `from` for tenant emails.
 * Falls back to RESEND_FROM_EMAIL / platform default when slug missing.
 */
export function buildClientResendFrom(opts: {
  clientName: string | null | undefined
  emailSlug?: string | null
  domain?: string
}): string {
  const display = (opts.clientName || 'Bino').trim() || 'Bino'
  const slug = resolveClientEmailSlug({
    emailSlug: opts.emailSlug,
    clientName: opts.clientName,
  })
  const domain = (opts.domain || RESEND_CLIENT_FROM_DOMAIN).replace(/^@/, '')
  if (slug) {
    return `${display} <${slug}@${domain}>`
  }
  return (
    (typeof process !== 'undefined' && process.env.RESEND_FROM_EMAIL?.trim()) ||
    `Bino <noreply@${domain}>`
  )
}
