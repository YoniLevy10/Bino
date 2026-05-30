/** sessionStorage key — shared between /superadmin and /admin/setup (same browser tab). */
export const ADMIN_SECRET_STORAGE_KEY = 'bamakor_admin_secret'

export function readAdminSecret(): string {
  if (typeof window === 'undefined') return ''
  try {
    return sessionStorage.getItem(ADMIN_SECRET_STORAGE_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function writeAdminSecret(secret: string): void {
  if (typeof window === 'undefined') return
  try {
    const trimmed = secret.trim()
    if (trimmed) sessionStorage.setItem(ADMIN_SECRET_STORAGE_KEY, trimmed)
    else sessionStorage.removeItem(ADMIN_SECRET_STORAGE_KEY)
  } catch {
    /* private browsing / quota */
  }
}

export function clearAdminSecret(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(ADMIN_SECRET_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
