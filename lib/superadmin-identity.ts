/**
 * Superadmin identity allowlist — no shared secret, no customer-table writes.
 *
 * Authorization sources (OR):
 * 1. SUPERADMIN_EMAILS — comma-separated emails (Vercel env)
 * 2. SUPERADMIN_USER_IDS — comma-separated Auth user UUIDs
 * 3. app_metadata.superadmin === true (set in Supabase Auth dashboard)
 */

export type SuperadminIdentityUser = {
  id: string
  email?: string | null
  app_metadata?: Record<string, unknown> | null
}

function parseCsvEnv(name: string): string[] {
  const raw = process.env[name]?.trim()
  if (!raw) return []
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function getSuperadminEmailAllowlist(): string[] {
  return parseCsvEnv('SUPERADMIN_EMAILS')
}

export function getSuperadminUserIdAllowlist(): string[] {
  return parseCsvEnv('SUPERADMIN_USER_IDS')
}

export function hasAppMetadataSuperadminFlag(user: SuperadminIdentityUser): boolean {
  const meta = user.app_metadata
  if (!meta || typeof meta !== 'object') return false
  return meta.superadmin === true || meta.role === 'superadmin'
}

/** Pure check: is this Auth user allowed to be a platform superadmin (before MFA). */
export function isSuperadminIdentity(user: SuperadminIdentityUser): boolean {
  if (!user?.id) return false
  if (hasAppMetadataSuperadminFlag(user)) return true

  const email = user.email?.trim().toLowerCase()
  if (email) {
    const emails = getSuperadminEmailAllowlist()
    if (emails.includes(email)) return true
  }

  const ids = getSuperadminUserIdAllowlist()
  if (ids.includes(user.id.trim().toLowerCase())) return true

  return false
}

export type SuperadminAal = 'aal1' | 'aal2' | null

export function isAal2(level: SuperadminAal | string | null | undefined): boolean {
  return level === 'aal2'
}
