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
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    } as unknown as Parameters<typeof requireClientIdForUser>[0]

    await expect(requireClientIdForUser(admin, 'user-without-org')).rejects.toThrow(
      'NO_CLIENT_FOR_USER'
    )
  })

  it('resolveClientIdForUserId returns null when user belongs to multiple clients', async () => {
    const admin = {
      from: (table: string) => {
        if (table === 'organization_users') {
          return {
            select: () => ({
              eq: () =>
                Promise.resolve({
                  data: [
                    { organization_id: 'org-a' },
                    { organization_id: 'org-b' },
                  ],
                  error: null,
                }),
            }),
          }
        }
        if (table === 'organizations') {
          return {
            select: () => ({
              in: () =>
                Promise.resolve({
                  data: [
                    { client_id: 'client-a' },
                    { client_id: 'client-b' },
                  ],
                  error: null,
                }),
            }),
          }
        }
        throw new Error(`unexpected table ${table}`)
      },
    } as unknown as Parameters<typeof resolveClientIdForUserId>[0]

    await expect(resolveClientIdForUserId(admin, 'multi-tenant-user')).resolves.toBeNull()
  })

  it('resolveClientIdForUserId returns null when user has no organization_users rows', async () => {
    const admin = {
      from: () => ({
        select: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
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
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    } as unknown as Parameters<typeof userHasTenantAccess>[0]

    await expect(userHasTenantAccess(admin, 'orphan-user')).resolves.toBe(false)
  })
})
