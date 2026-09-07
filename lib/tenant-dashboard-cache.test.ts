import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function installMemoryStorage() {
  const store = new Map<string, string>()
  const api = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    get length() {
      return store.size
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  }
  vi.stubGlobal('sessionStorage', api)
  vi.stubGlobal('localStorage', api)
  vi.stubGlobal('window', globalThis)
  return store
}

describe('tenant browser cache isolation', () => {
  beforeEach(() => {
    installMemoryStorage()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('clearTenantBrowserCaches removes dashboard, branding, tickets, and splash keys', async () => {
    const {
      clearTenantBrowserCaches,
      dashboardCacheKey,
      DASHBOARD_CACHE_LEGACY_KEY,
      SPLASH_DONE_KEY,
      TENANT_CID_SESSION_KEY,
      TENANT_CID_LOCAL_KEY,
    } = await import('@/lib/tenant-browser-cache')

    localStorage.setItem(DASHBOARD_CACHE_LEGACY_KEY, JSON.stringify({ tickets: [{ id: 'a' }] }))
    localStorage.setItem(dashboardCacheKey('uid-a', 'client-a'), JSON.stringify({ tickets: [] }))
    localStorage.setItem('bamakor_branding_v1_client-a', JSON.stringify({ branding: { displayName: 'A' }, ts: Date.now() }))
    localStorage.setItem('bamakor_tickets_v2_client-a', JSON.stringify({ tickets: [] }))
    localStorage.setItem('bamakor_projects_v1_client-a', JSON.stringify({ projects: [] }))
    localStorage.setItem('bamakor_workers_v1_client-a', JSON.stringify({ workers: [] }))
    localStorage.setItem('bamakor_summary_meta_v1_client-a', '{}')
    localStorage.setItem(TENANT_CID_LOCAL_KEY, JSON.stringify({ cid: 'client-a', uid: 'uid-a', ts: Date.now() }))
    localStorage.setItem('bamakor_manager_push_enabled', '1')
    localStorage.setItem('bamakor_worker_push_enabled', '1')
    sessionStorage.setItem(TENANT_CID_SESSION_KEY, JSON.stringify({ cid: 'client-a', uid: 'uid-a', ts: Date.now() }))
    sessionStorage.setItem(SPLASH_DONE_KEY, '1')
    sessionStorage.setItem('bamakor_last_auth_uid', 'uid-a')

    clearTenantBrowserCaches()

    expect(localStorage.getItem(DASHBOARD_CACHE_LEGACY_KEY)).toBeNull()
    expect(localStorage.getItem(dashboardCacheKey('uid-a', 'client-a'))).toBeNull()
    expect(localStorage.getItem('bamakor_branding_v1_client-a')).toBeNull()
    expect(localStorage.getItem('bamakor_tickets_v2_client-a')).toBeNull()
    expect(localStorage.getItem('bamakor_projects_v1_client-a')).toBeNull()
    expect(localStorage.getItem('bamakor_workers_v1_client-a')).toBeNull()
    expect(localStorage.getItem('bamakor_manager_push_enabled')).toBeNull()
    expect(localStorage.getItem('bamakor_worker_push_enabled')).toBeNull()
    expect(localStorage.getItem(TENANT_CID_LOCAL_KEY)).toBeNull()
    expect(sessionStorage.getItem(TENANT_CID_SESSION_KEY)).toBeNull()
    expect(sessionStorage.getItem(SPLASH_DONE_KEY)).toBeNull()
    expect(sessionStorage.getItem('bamakor_last_auth_uid')).toBeNull()
  })

  it('readTenantDashboardCache rejects mismatched uid/clientId and drops legacy blob', async () => {
    const { DASHBOARD_CACHE_LEGACY_KEY, dashboardCacheKey } = await import('@/lib/tenant-browser-cache')
    const { readTenantDashboardCache, writeTenantDashboardCache } = await import(
      '@/lib/dashboard-tenant-cache'
    )

    localStorage.setItem(
      DASHBOARD_CACHE_LEGACY_KEY,
      JSON.stringify({ tickets: [{ id: 'legacy' }], savedAt: Date.now() })
    )

    writeTenantDashboardCache('uid-a', 'client-a', {
      tickets: [{ id: 'a' }],
      closedCount: 1,
    })

    // Wrong tenant must never paint.
    expect(readTenantDashboardCache('uid-b', 'client-a')).toBeNull()
    expect(readTenantDashboardCache('uid-a', 'client-b')).toBeNull()

    const ok = readTenantDashboardCache<{ tickets: { id: string }[]; closedCount: number }>(
      'uid-a',
      'client-a'
    )
    expect(ok?.tickets).toEqual([{ id: 'a' }])
    expect(ok?.closedCount).toBe(1)
    expect(localStorage.getItem(DASHBOARD_CACHE_LEGACY_KEY)).toBeNull()

    // Tampered envelope with wrong embedded ids is rejected even under the right key.
    localStorage.setItem(
      dashboardCacheKey('uid-a', 'client-a'),
      JSON.stringify({
        tickets: [{ id: 'tampered' }],
        savedAt: Date.now(),
        clientId: 'client-other',
        uid: 'uid-a',
      })
    )
    expect(readTenantDashboardCache('uid-a', 'client-a')).toBeNull()
  })

  it('clearAllTenantUiCaches aliases the full wipe', async () => {
    const { clearAllTenantUiCaches, clearTenantBrowserCaches, DASHBOARD_CACHE_LEGACY_KEY } =
      await import('@/lib/tenant-browser-cache')
    expect(clearAllTenantUiCaches).toBe(clearTenantBrowserCaches)
    localStorage.setItem(DASHBOARD_CACHE_LEGACY_KEY, 'x')
    clearAllTenantUiCaches()
    expect(localStorage.getItem(DASHBOARD_CACHE_LEGACY_KEY)).toBeNull()
  })
})
