/**
 * Unit tests for requireSessionWriteAccess + paid-addon write option.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canOrgRoleWrite } from '@/lib/org-role'

const getUser = vi.fn()
const getSingletonClientId = vi.fn()
const resolveOrgRoleForUserClient = vi.fn()
const clientHasPaidAddon = vi.fn()
const getCatalogRowForAddon = vi.fn()

vi.mock('@/lib/supabase-route-handler', () => ({
  createSupabaseRouteHandlerClient: vi.fn(async () => ({
    auth: { getUser },
  })),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: vi.fn(() => ({ __admin: true })),
}))

vi.mock('@/lib/singleton-client-server', () => ({
  getSingletonClientId: (...args: unknown[]) => getSingletonClientId(...args),
}))

vi.mock('@/lib/org-role-resolve', () => ({
  resolveOrgRoleForUserClient: (...args: unknown[]) => resolveOrgRoleForUserClient(...args),
}))

vi.mock('@/lib/paid-addons', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/paid-addons')>()
  return {
    ...actual,
    clientHasPaidAddon: (...args: unknown[]) => clientHasPaidAddon(...args),
    getCatalogRowForAddon: (...args: unknown[]) => getCatalogRowForAddon(...args),
  }
})

import { requireSessionWriteAccess } from '@/lib/api-auth'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'

describe('requireSessionWriteAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    getSingletonClientId.mockResolvedValue('client-1')
  })

  it('rejects viewer with VIEWER_READ_ONLY / 403', async () => {
    resolveOrgRoleForUserClient.mockResolvedValue('viewer')
    expect(canOrgRoleWrite('viewer')).toBe(false)

    const result = await requireSessionWriteAccess()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(403)
    const body = await result.response.json()
    expect(body.code).toBe('VIEWER_READ_ONLY')
  })

  it('allows manager', async () => {
    resolveOrgRoleForUserClient.mockResolvedValue('manager')
    const result = await requireSessionWriteAccess()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ctx.role).toBe('manager')
    expect(result.ctx.clientId).toBe('client-1')
  })

  it('allows admin', async () => {
    resolveOrgRoleForUserClient.mockResolvedValue('admin')
    const result = await requireSessionWriteAccess()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ctx.role).toBe('admin')
  })
})

describe('requireSessionClientPaidAddon({ write: true })', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    getSingletonClientId.mockResolvedValue('client-1')
    clientHasPaidAddon.mockResolvedValue(true)
  })

  it('viewer denied before addon check', async () => {
    resolveOrgRoleForUserClient.mockResolvedValue('viewer')
    const result = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.calendar, { write: true })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(403)
    expect((await result.response.json()).code).toBe('VIEWER_READ_ONLY')
    expect(clientHasPaidAddon).not.toHaveBeenCalled()
  })

  it('manager with addon allowed', async () => {
    resolveOrgRoleForUserClient.mockResolvedValue('manager')
    const result = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.calendar, { write: true })
    expect(result.ok).toBe(true)
    expect(clientHasPaidAddon).toHaveBeenCalled()
  })
})
