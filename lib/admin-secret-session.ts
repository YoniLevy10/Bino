/** sessionStorage key — shared between /superadmin and /admin/setup (same browser tab). */
export const ADMIN_SECRET_STORAGE_KEY = 'bamakor_admin_secret'

/** localStorage key — optional "remember on this device" (survives PWA/tab close). */
export const ADMIN_SECRET_PERSIST_KEY = 'bamakor_admin_secret_persist'

export function readAdminSecret(): string {
  if (typeof window === 'undefined') return ''
  try {
    const session = sessionStorage.getItem(ADMIN_SECRET_STORAGE_KEY)?.trim()
    if (session) return session
    return localStorage.getItem(ADMIN_SECRET_PERSIST_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function isAdminSecretPersisted(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return !!localStorage.getItem(ADMIN_SECRET_PERSIST_KEY)?.trim()
  } catch {
    return false
  }
}

export function writeAdminSecret(secret: string, opts?: { persist?: boolean }): void {
  if (typeof window === 'undefined') return
  try {
    const trimmed = secret.trim()
    if (trimmed) {
      sessionStorage.setItem(ADMIN_SECRET_STORAGE_KEY, trimmed)
      if (opts?.persist) {
        localStorage.setItem(ADMIN_SECRET_PERSIST_KEY, trimmed)
      } else if (opts?.persist === false) {
        localStorage.removeItem(ADMIN_SECRET_PERSIST_KEY)
      }
    } else {
      sessionStorage.removeItem(ADMIN_SECRET_STORAGE_KEY)
      localStorage.removeItem(ADMIN_SECRET_PERSIST_KEY)
    }
  } catch {
    /* private browsing / quota */
  }
}

export function clearAdminSecret(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(ADMIN_SECRET_STORAGE_KEY)
    localStorage.removeItem(ADMIN_SECRET_PERSIST_KEY)
  } catch {
    /* ignore */
  }
}
