/**
 * Tenant-scoped dashboard SWR cache.
 * Never paint a blob unless uid + clientId match the current session tenant.
 */

import {
  DASHBOARD_CACHE_LEGACY_KEY,
  dashboardCacheKey,
} from '@/lib/tenant-browser-cache'

export const DASHBOARD_CACHE_TTL_MS = 24 * 60 * 60 * 1000

export type DashboardCacheEnvelope<T extends object> = T & {
  savedAt: number
  clientId: string
  uid: string
}

export function readTenantDashboardCache<T extends object>(
  uid: string,
  clientId: string
): (T & { savedAt: number }) | null {
  if (typeof localStorage === 'undefined' || !uid || !clientId) return null
  try {
    // Drop legacy unkeyed blob so it can never flash another tenant.
    localStorage.removeItem(DASHBOARD_CACHE_LEGACY_KEY)

    const raw = localStorage.getItem(dashboardCacheKey(uid, clientId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as DashboardCacheEnvelope<T>
    if (!parsed || typeof parsed !== 'object') return null
    if (parsed.clientId !== clientId || parsed.uid !== uid) return null
    if (typeof parsed.savedAt !== 'number') return null
    if (Date.now() - parsed.savedAt > DASHBOARD_CACHE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

export function writeTenantDashboardCache<T extends object>(
  uid: string,
  clientId: string,
  data: T
): void {
  if (typeof localStorage === 'undefined' || !uid || !clientId) return
  try {
    localStorage.removeItem(DASHBOARD_CACHE_LEGACY_KEY)
    const payload: DashboardCacheEnvelope<T> = {
      ...data,
      savedAt: Date.now(),
      clientId,
      uid,
    }
    localStorage.setItem(dashboardCacheKey(uid, clientId), JSON.stringify(payload))
  } catch {
    /* storage full or unavailable */
  }
}
