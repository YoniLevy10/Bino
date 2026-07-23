/** sessionStorage key — shared between /superadmin and /admin/setup (same browser tab). */
export const ADMIN_SECRET_STORAGE_KEY = 'bamakor_admin_secret'

/** @deprecated Cleared on read — secrets must not persist across browser sessions. */
export const ADMIN_SECRET_PERSIST_KEY = 'bamakor_admin_secret_persist'

function clearPersistedSecret(): void {
  try {
    localStorage.removeItem(ADMIN_SECRET_PERSIST_KEY)
  } catch {
    /* ignore */
  }
}

export function readAdminSecret(): string {
  if (typeof window === 'undefined') return ''
  try {
    clearPersistedSecret()
    return sessionStorage.getItem(ADMIN_SECRET_STORAGE_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

/** Always false — device persistence was removed for security. */
export function isAdminSecretPersisted(): boolean {
  return false
}

export function writeAdminSecret(secret: string, _opts?: { persist?: boolean }): void {
  if (typeof window === 'undefined') return
  try {
    clearPersistedSecret()
    const trimmed = secret.trim()
    if (trimmed) {
      sessionStorage.setItem(ADMIN_SECRET_STORAGE_KEY, trimmed)
    } else {
      sessionStorage.removeItem(ADMIN_SECRET_STORAGE_KEY)
    }
  } catch {
    /* private browsing / quota */
  }
}

export function clearAdminSecret(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(ADMIN_SECRET_STORAGE_KEY)
    clearPersistedSecret()
  } catch {
    /* ignore */
  }
}
