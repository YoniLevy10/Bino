import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { resolveClientIdForUserId, requireClientIdForUser } from '@/lib/tenant-resolution'

describe('tenant resolution security', () => {
  const prevNodeEnv = process.env.NODE_ENV
  const prevBamakorClientId = process.env.BAMAKOR_CLIENT_ID

  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production')
    delete process.env.BAMAKOR_CLIENT_ID
  })

  afterEach(() => {
    vi.stubEnv('NODE_ENV', prevNodeEnv ?? 'test')
    if (prevBamakorClientId !== undefined) {
      process.env.BAMAKOR_CLIENT_ID = prevBamakorClientId
    } else {
      delete process.env.BAMAKOR_CLIENT_ID
    }
  })

  it('requireClientIdForUser rejects users without org in production', async () => {
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof requireClientIdForUser>[0]

    await expect(requireClientIdForUser(admin, 'user-without-org')).rejects.toThrow(
      'NO_CLIENT_FOR_USER'
    )
  })

  it('resolveClientIdForUserId returns null when user has no organization_users rows', async () => {
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof resolveClientIdForUserId>[0]

    await expect(resolveClientIdForUserId(admin, 'orphan-user')).resolves.toBeNull()
  })
})

describe('userHasTenantAccess', () => {
  it('returns false when resolveClientIdForUserId is null', async () => {
    const { userHasTenantAccess } = await import('@/lib/tenant-access')
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      }),
    } as unknown as Parameters<typeof userHasTenantAccess>[0]

    await expect(userHasTenantAccess(admin, 'orphan-user')).resolves.toBe(false)
  })
})
