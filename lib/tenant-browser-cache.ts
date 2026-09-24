/** Browser-only tenant caches — must clear on sign-out / before a fresh login / tenant switch. */

export const TENANT_CID_SESSION_KEY = 'bamakor_cid_v1'

/** Survives tab kill on mobile (paired with session key in bamakor-client). */
export const TENANT_CID_LOCAL_KEY = 'bamakor_cid_local_v1'

/** Sidebar nav order + enabled_nav_features (SidebarNavContext). */
export const NAV_CACHE_PREFIX = 'bamakor_nav_v5_' as const

/** Paid add-on entitlements (PaidAddonsContext). */
export const ADDONS_CACHE_PREFIX = 'bamakor_addons_v1_' as const

/** Auth uid tracker used by TenantAuthSync + branding gate. */
export const LAST_AUTH_UID_KEY = 'bamakor_last_auth_uid'

export const SPLASH_DONE_KEY = 'bamakor_splash_done'

/** Legacy unkeyed dashboard blob (pre tenant-isolation). */
export const DASHBOARD_CACHE_LEGACY_KEY = 'bamakor_dashboard_v2'

/** Prefixed dashboard SWR: bamakor_dashboard_v3_{uid}_{clientId} */
export const DASHBOARD_CACHE_PREFIX = 'bamakor_dashboard_v3_' as const

const LOCAL_EXACT_KEYS = [
  DASHBOARD_CACHE_LEGACY_KEY,
  'bamakor_manager_push_enabled',
  'bamakor_worker_push_enabled',
] as const

const LOCAL_PREFIXES = [
  'bamakor_branding_v1_',
  'bamakor_nav_v4_',
  NAV_CACHE_PREFIX,
  ADDONS_CACHE_PREFIX,
  DASHBOARD_CACHE_PREFIX,
  'bamakor_tickets_v2_',
  'bamakor_projects_v1_',
  'bamakor_workers_v1_',
  'bamakor_summary_meta_v1_',
  'bamakor_summary_kpi_v1_',
  'bamakor_summary_',
] as const

const SESSION_EXACT_KEYS = [TENANT_CID_SESSION_KEY, LAST_AUTH_UID_KEY, SPLASH_DONE_KEY] as const

/**
 * Wipe all tenant UI caches (cid, branding, nav, dashboard, tickets, projects, …).
 * Call on every tenant / auth boundary so another client's data never paints.
 */
export function clearTenantBrowserCaches(): void {
  if (typeof localStorage === 'undefined' || typeof sessionStorage === 'undefined') return
  try {
    for (const key of SESSION_EXACT_KEYS) {
      sessionStorage.removeItem(key)
    }
    localStorage.removeItem(TENANT_CID_LOCAL_KEY)
    for (const key of LOCAL_EXACT_KEYS) {
      localStorage.removeItem(key)
    }
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

/** @deprecated use clearTenantBrowserCaches — same full wipe */
export const clearAllTenantUiCaches = clearTenantBrowserCaches

export function dashboardCacheKey(uid: string, clientId: string): string {
  return `${DASHBOARD_CACHE_PREFIX}${uid}_${clientId}`
}
