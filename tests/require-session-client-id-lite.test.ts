/**
 * Lite session path skips org-role resolve for hot shell reads.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUser = vi.fn()
const getSingletonClientId = vi.fn()
const resolveOrgRoleForUserClient = vi.fn()

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

import { requireSessionClientId, requireSessionClientIdLite } from '@/lib/api-auth'

describe('requireSessionClientIdLite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    getSingletonClientId.mockResolvedValue('client-1')
  })

  it('returns userId + clientId + admin without resolving org role', async () => {
    const result = await requireSessionClientIdLite()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ctx.userId).toBe('u1')
    expect(result.ctx.clientId).toBe('client-1')
    expect(result.ctx.admin).toEqual({ __admin: true })
    expect(resolveOrgRoleForUserClient).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    const result = await requireSessionClientIdLite()
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.response.status).toBe(401)
    expect(resolveOrgRoleForUserClient).not.toHaveBeenCalled()
  })
})

describe('requireSessionClientId (full path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    getSingletonClientId.mockResolvedValue('client-1')
    resolveOrgRoleForUserClient.mockResolvedValue('manager')
  })

  it('still resolves org role for write-gated callers', async () => {
    const result = await requireSessionClientId()
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.ctx.role).toBe('manager')
    expect(resolveOrgRoleForUserClient).toHaveBeenCalledWith(
      { __admin: true },
      'u1',
      'client-1'
    )
  })
})
