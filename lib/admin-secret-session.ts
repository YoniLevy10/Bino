/**
 * Legacy shared-secret storage keys (REMOVED).
 *
 * Superadmin auth is now Supabase Auth identity + MFA (AAL2).
 * These helpers only purge old sessionStorage/localStorage values so a
 * previously stored ADMIN_SETUP_SECRET can never unlock the panel again.
 */

/** @deprecated Cleared on every superadmin entry; never read for auth. */
export const ADMIN_SECRET_STORAGE_KEY = 'bamakor_admin_secret'

/** @deprecated Cleared on every superadmin entry; never read for auth. */
export const ADMIN_SECRET_PERSIST_KEY = 'bamakor_admin_secret_persist'

/** True if a legacy secret blob still exists in either storage. */
export function hasLegacyAdminSecret(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const session = sessionStorage.getItem(ADMIN_SECRET_STORAGE_KEY)?.trim()
    const persist = localStorage.getItem(ADMIN_SECRET_PERSIST_KEY)?.trim()
    return Boolean(session || persist)
  } catch {
    return false
  }
}

/**
 * Wipe legacy secret keys. Call on superadmin mount before any auth UI.
 * Returns whether a secret was present (so UI can show a migration notice).
 */
export function purgeLegacyAdminSecret(): boolean {
  if (typeof window === 'undefined') return false
  const had = hasLegacyAdminSecret()
  try {
    sessionStorage.removeItem(ADMIN_SECRET_STORAGE_KEY)
    localStorage.removeItem(ADMIN_SECRET_PERSIST_KEY)
  } catch {
    /* private browsing / quota */
  }
  return had
}

/** @deprecated No-op — secrets are never stored. Always purges leftovers. */
export function readAdminSecret(): string {
  purgeLegacyAdminSecret()
  return ''
}

/** @deprecated Always false — persist path removed. */
export function isAdminSecretPersisted(): boolean {
  return false
}

/** @deprecated No-op — writing the shared secret is forbidden. */
export function writeAdminSecret(_secret?: string, _opts?: { persist?: boolean }): void {
  purgeLegacyAdminSecret()
}

/** Alias for purge — clears any leftover legacy keys. */
export function clearAdminSecret(): void {
  purgeLegacyAdminSecret()
}
