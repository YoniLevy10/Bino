import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AUTH_RATE_LIMIT_DB_SYNC_EVERY,
  __resetRateLimitLocalBucketsForTests,
  checkAuthenticatedRateLimitSparse,
  checkRateLimitMemoryOnly,
} from '@/lib/rate-limit'

afterEach(() => {
  __resetRateLimitLocalBucketsForTests()
  vi.restoreAllMocks()
})

function mockAdmin(rpcImpl: (args: unknown) => Promise<{ data: unknown; error: null | { message: string; code?: string } }>) {
  return {
    rpc: vi.fn(async (_name: string, args: unknown) => rpcImpl(args)),
  } as unknown as Parameters<typeof checkAuthenticatedRateLimitSparse>[0]
}

describe('checkRateLimitMemoryOnly', () => {
  it('limits after max hits in the window', () => {
    for (let i = 0; i < 3; i++) {
      const r = checkRateLimitMemoryOnly('mem:a', 3, 60_000)
      expect(r.isLimited).toBe(false)
    }
    expect(checkRateLimitMemoryOnly('mem:a', 3, 60_000).isLimited).toBe(true)
  })
})

describe('checkAuthenticatedRateLimitSparse', () => {
  it('skips most DB syncs within a window', async () => {
    const admin = mockAdmin(async () => ({
      data: [{ is_limited: false, remaining: 19, reset_at: new Date(Date.now() + 60_000).toISOString() }],
      error: null,
    }))

    const limit = 20
    for (let i = 0; i < AUTH_RATE_LIMIT_DB_SYNC_EVERY; i++) {
      const r = await checkAuthenticatedRateLimitSparse(admin, 'post:user:u1:slug', limit, 60_000, {
        failOpenOnRpcError: false,
      })
      expect(r.isLimited).toBe(false)
    }

    // First hit syncs; next (syncEvery - 1) stay local-only.
    expect(admin.rpc).toHaveBeenCalledTimes(1)

    // Next hit crosses syncEvery → second DB call.
    await checkAuthenticatedRateLimitSparse(admin, 'post:user:u1:slug', limit, 60_000, {
      failOpenOnRpcError: false,
    })
    expect(admin.rpc).toHaveBeenCalledTimes(2)
  })

  it('enforces the local limit without needing DB', async () => {
    const admin = mockAdmin(async () => ({
      data: [{ is_limited: false, remaining: 100, reset_at: new Date(Date.now() + 60_000).toISOString() }],
      error: null,
    }))

    const limit = 3
    for (let i = 0; i < limit; i++) {
      await checkAuthenticatedRateLimitSparse(admin, 'get:user:u2:r', limit, 60_000, {
        failOpenOnRpcError: true,
      })
    }
    const blocked = await checkAuthenticatedRateLimitSparse(admin, 'get:user:u2:r', limit, 60_000, {
      failOpenOnRpcError: true,
    })
    expect(blocked.isLimited).toBe(true)
  })

  it('fail-opens on RPC error when configured', async () => {
    const admin = mockAdmin(async () => ({
      data: null,
      error: { message: 'boom', code: '57014' },
    }))

    const r = await checkAuthenticatedRateLimitSparse(admin, 'get:user:u3:r', 10, 60_000, {
      failOpenOnRpcError: true,
    })
    expect(r.isLimited).toBe(false)
  })
})
