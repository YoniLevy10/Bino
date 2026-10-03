/**
 * Superadmin MFA / identity auth unit tests.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUser = vi.fn()
const getAuthenticatorAssuranceLevel = vi.fn()
const getSupabaseAdmin = vi.fn(() => ({ __admin: true }))

vi.mock('@/lib/supabase-route-handler', () => ({
  createSupabaseRouteHandlerClient: vi.fn(async () => ({
    auth: {
      getUser,
      mfa: { getAuthenticatorAssuranceLevel },
    },
  })),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => getSupabaseAdmin(),
}))

import {
  hasAppMetadataSuperadminFlag,
  isAal2,
  isSuperadminIdentity,
} from '@/lib/superadmin-identity'
import { requireSuperAdmin } from '@/lib/superadmin-auth'
import {
  hasLegacyAdminSecret,
  purgeLegacyAdminSecret,
  readAdminSecret,
  writeAdminSecret,
} from '@/lib/admin-secret-session'

describe('isSuperadminIdentity', () => {
  beforeEach(() => {
    delete process.env.SUPERADMIN_EMAILS
    delete process.env.SUPERADMIN_USER_IDS
  })

  it('allows app_metadata.superadmin', () => {
    expect(
      isSuperadminIdentity({
        id: 'u1',
        email: 'x@example.com',
        app_metadata: { superadmin: true },
      }),
    ).toBe(true)
    expect(hasAppMetadataSuperadminFlag({ id: 'u1', app_metadata: { role: 'superadmin' } })).toBe(
      true,
    )
  })

  it('allows SUPERADMIN_EMAILS allowlist (case-insensitive)', () => {
    process.env.SUPERADMIN_EMAILS = 'Owner@Bino.casa, ops@bino.casa'
    expect(isSuperadminIdentity({ id: 'u1', email: 'owner@bino.casa' })).toBe(true)
    expect(isSuperadminIdentity({ id: 'u2', email: 'other@bino.casa' })).toBe(false)
  })

  it('allows SUPERADMIN_USER_IDS allowlist', () => {
    process.env.SUPERADMIN_USER_IDS = 'aaa-bbb, CCC-DDD'
    expect(isSuperadminIdentity({ id: 'AAA-BBB', email: null })).toBe(true)
    expect(isSuperadminIdentity({ id: 'zzz', email: null })).toBe(false)
  })

  it('rejects empty identity', () => {
    expect(isSuperadminIdentity({ id: '', email: 'a@b.com' })).toBe(false)
  })
})

describe('isAal2', () => {
  it('only accepts aal2', () => {
    expect(isAal2('aal2')).toBe(true)
    expect(isAal2('aal1')).toBe(false)
    expect(isAal2(null)).toBe(false)
  })
})

describe('requireSuperAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SUPERADMIN_EMAILS = 'owner@bino.casa'
    delete process.env.SUPERADMIN_USER_IDS
  })

  it('rejects missing session', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: 'nope' } })
    const result = await requireSuperAdmin()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(401)
    const body = await result.response.json()
    expect(body.code).toBe('SUPERADMIN_AUTH_REQUIRED')
  })

  it('rejects non-allowlisted user', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'stranger@example.com', app_metadata: {} } },
      error: null,
    })
    const result = await requireSuperAdmin()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(403)
    const body = await result.response.json()
    expect(body.code).toBe('SUPERADMIN_FORBIDDEN')
  })

  it('rejects allowlisted user without AAL2', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'owner@bino.casa', app_metadata: {} } },
      error: null,
    })
    getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    })
    const result = await requireSuperAdmin()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(401)
    const body = await result.response.json()
    expect(body.code).toBe('SUPERADMIN_MFA_REQUIRED')
  })

  it('allows allowlisted user with AAL2', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: 'u1', email: 'owner@bino.casa', app_metadata: {} } },
      error: null,
    })
    getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: 'aal2', nextLevel: null },
      error: null,
    })
    const result = await requireSuperAdmin()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ctx.userId).toBe('u1')
    expect(result.ctx.aal).toBe('aal2')
  })

  it('ignores x-admin-secret header entirely (no bypass)', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    const fakeReq = new Request('http://localhost/api/superadmin/stats', {
      headers: { 'x-admin-secret': 'anything' },
    })
    // requireSuperAdmin does not take the request — secret cannot unlock
    void fakeReq
    const result = await requireSuperAdmin()
    expect(result.ok).toBe(false)
  })
})

describe('legacy admin secret purge', () => {
  beforeEach(() => {
    const store: Record<string, string> = {}
    const api = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v
      },
      removeItem: (k: string) => {
        delete store[k]
      },
    }
    vi.stubGlobal('sessionStorage', api)
    vi.stubGlobal('localStorage', api)
    store.bamakor_admin_secret = 'old-secret'
    store.bamakor_admin_secret_persist = 'old-secret'
  })

  it('detects and purges legacy secret; never returns it for auth', () => {
    expect(hasLegacyAdminSecret()).toBe(true)
    expect(purgeLegacyAdminSecret()).toBe(true)
    expect(hasLegacyAdminSecret()).toBe(false)
    expect(readAdminSecret()).toBe('')
    writeAdminSecret('should-not-persist', { persist: true })
    expect(readAdminSecret()).toBe('')
    expect(hasLegacyAdminSecret()).toBe(false)
  })
})
