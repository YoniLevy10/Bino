/** Browser-only tenant caches — must clear on sign-out / before a fresh login. */

export const TENANT_CID_SESSION_KEY = 'bamakor_cid_v1'

/** Sidebar nav order + enabled_nav_features (SidebarNavContext). */
export const NAV_CACHE_PREFIX = 'bamakor_nav_v5_' as const

const LOCAL_PREFIXES = ['bamakor_branding_v1_', 'bamakor_nav_v4_', NAV_CACHE_PREFIX] as const

export function clearTenantBrowserCaches(): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(TENANT_CID_SESSION_KEY)
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && LOCAL_PREFIXES.some((p) => key.startsWith(p))) {
        keysToRemove.push(key)
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key)
    }
  } catch {
    // private mode / quota
  }
}
