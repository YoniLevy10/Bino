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

const CID_LOCAL_HYDRATION_TTL_MS = 24 * 60 * 60 * 1000

type StoredCidPayload = { cid?: string; uid?: string; ts?: number }

function readStoredCid(raw: string | null): StoredCidPayload | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as StoredCidPayload
    if (!parsed?.cid || !parsed?.uid) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Sync read of the session/local-bound tenant id for hydrating nav/addons/RQ
 * on first paint (avoids empty→full menu flicker while auth resolves).
 *
 * Order: sessionStorage (5m hot path) → localStorage (survives mobile tab kill).
 * Requires matching LAST_AUTH_UID when that marker exists; if the marker is gone
 * (new tab / session wipe) still accept a fresh local entry for hydration only.
 */
export function tryReadSessionBoundClientId(): string | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const lastUid = sessionStorage.getItem(LAST_AUTH_UID_KEY)
    const sessionEntry = readStoredCid(sessionStorage.getItem(TENANT_CID_SESSION_KEY))
    if (sessionEntry?.cid && sessionEntry.uid) {
      if (!lastUid || lastUid === sessionEntry.uid) return sessionEntry.cid
    }

    if (typeof localStorage === 'undefined') return null
    const localEntry = readStoredCid(localStorage.getItem(TENANT_CID_LOCAL_KEY))
    if (!localEntry?.cid || !localEntry.uid) return null
    if (lastUid && lastUid !== localEntry.uid) return null
    if (
      typeof localEntry.ts === 'number' &&
      Date.now() - localEntry.ts >= CID_LOCAL_HYDRATION_TTL_MS
    ) {
      return null
    }
    return localEntry.cid
  } catch {
    return null
  }
}

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
