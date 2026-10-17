/**
 * Shell APIs that must not pay resolveOrgRoleForUserClient.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireSessionClientIdLite = vi.fn()
const requireSessionClientId = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  requireSessionClientIdLite: (...args: unknown[]) => requireSessionClientIdLite(...args),
  requireSessionClientId: (...args: unknown[]) => requireSessionClientId(...args),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimitMemoryOnly: () => ({ isLimited: false }),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              sidebar_nav_order: null,
              sidebar_nav_labels: null,
              enabled_nav_features: null,
            },
            error: null,
          }),
        }),
      }),
      insert: async () => ({ error: null }),
    }),
  })),
}))

vi.mock('@/lib/paid-addons', () => ({
  listActiveAddonsCatalog: vi.fn(async () => []),
  getClientEnabledAddonKeys: vi.fn(async () => new Set<string>()),
}))

import { GET as navConfigGet } from '@/app/api/client/nav-config/route'
import { POST as pageViewPost } from '@/app/api/analytics/page-view/route'
import { GET as entitlementsGet } from '@/app/api/addons/entitlements/route'

const liteCtx = {
  userId: 'u1',
  clientId: 'client-1',
  admin: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              sidebar_nav_order: null,
              sidebar_nav_labels: null,
              enabled_nav_features: null,
            },
            error: null,
          }),
        }),
      }),
      insert: async () => ({ error: null }),
    }),
  },
}

describe('shell routes use requireSessionClientIdLite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireSessionClientIdLite.mockResolvedValue({ ok: true, ctx: liteCtx })
  })

  it('GET /api/client/nav-config uses lite session (no full requireSessionClientId)', async () => {
    const res = await navConfigGet()
    expect(requireSessionClientIdLite).toHaveBeenCalledTimes(1)
    expect(requireSessionClientId).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
  })

  it('POST /api/analytics/page-view uses lite session', async () => {
    const req = new Request('http://localhost/api/analytics/page-view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/dashboard', nav_id: 'dashboard' }),
    })
    const res = await pageViewPost(req)
    expect(requireSessionClientIdLite).toHaveBeenCalledTimes(1)
    expect(requireSessionClientId).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
  })

  it('GET /api/addons/entitlements uses lite session (role unused)', async () => {
    const res = await entitlementsGet()
    expect(requireSessionClientIdLite).toHaveBeenCalledTimes(1)
    expect(requireSessionClientId).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
  })
})
