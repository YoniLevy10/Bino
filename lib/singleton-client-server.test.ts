import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/tenant-resolution', () => ({
  requireClientIdForUser: vi.fn(async (_admin: unknown, userId: string) => `client-for-${userId}`),
}))

describe('getSingletonClientId process cache', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('caches client id per user for subsequent calls', async () => {
    const { requireClientIdForUser } = await import('@/lib/tenant-resolution')
    const { getSingletonClientId, clearSingletonClientIdCache } = await import(
      '@/lib/singleton-client-server'
    )
    clearSingletonClientIdCache()

    const admin = {} as never
    const a = await getSingletonClientId(admin, 'user-a')
    const b = await getSingletonClientId(admin, 'user-a')
    expect(a).toBe('client-for-user-a')
    expect(b).toBe('client-for-user-a')
    expect(requireClientIdForUser).toHaveBeenCalledTimes(1)

    await getSingletonClientId(admin, 'user-b')
    expect(requireClientIdForUser).toHaveBeenCalledTimes(2)
  })
})
