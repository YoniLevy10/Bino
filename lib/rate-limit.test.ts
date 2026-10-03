import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AUTH_RATE_LIMIT_DB_SYNC_EVERY,
  PUBLIC_REPORT_CLIENT_HOURLY_CEILING,
  PUBLIC_REPORT_SOURCE_BURST_LIMIT,
  PUBLIC_REPORT_SOURCE_HOURLY_LIMIT,
  __resetRateLimitLocalBucketsForTests,
  checkAuthenticatedRateLimitSparse,
  checkPublicReportClientHourlyCeiling,
  checkPublicReportSourceBurstLimit,
  checkPublicReportSourceHourlyLimit,
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

describe('public report source×client limits (distributed RPC)', () => {
  it('burst helper fail-closes on RPC error', async () => {
    const admin = mockAdmin(async () => ({
      data: null,
      error: { message: 'down' },
    }))
    const r = await checkPublicReportSourceBurstLimit(admin, 'client-1', '1.2.3.4')
    expect(r.isLimited).toBe(true)
  })

  it('keys burst by client AND source IP so one IP cannot share another IP bucket', async () => {
    const keys: string[] = []
    const admin = mockAdmin(async (args) => {
      keys.push((args as { p_key: string }).p_key)
      return {
        data: [{ is_limited: false, remaining: 9, reset_at: new Date(Date.now() + 60_000).toISOString() }],
        error: null,
      }
    })

    await checkPublicReportSourceBurstLimit(admin, 'client-1', '10.0.0.1')
    await checkPublicReportSourceBurstLimit(admin, 'client-1', '10.0.0.2')

    expect(keys[0]).toContain('client:client-1:ip:10.0.0.1:burst')
    expect(keys[1]).toContain('client:client-1:ip:10.0.0.2:burst')
    expect(keys[0]).not.toEqual(keys[1])
    expect(PUBLIC_REPORT_SOURCE_BURST_LIMIT).toBe(10)
    expect(PUBLIC_REPORT_SOURCE_HOURLY_LIMIT).toBe(40)
    expect(PUBLIC_REPORT_CLIENT_HOURLY_CEILING).toBeGreaterThan(PUBLIC_REPORT_SOURCE_HOURLY_LIMIT)
  })

  it('passes through limited=true from RPC for source burst/hourly and client ceiling', async () => {
    const admin = mockAdmin(async () => ({
      data: [{ is_limited: true, remaining: 0, reset_at: new Date(Date.now() + 60_000).toISOString() }],
      error: null,
    }))
    expect((await checkPublicReportSourceBurstLimit(admin, 'client-2', '9.9.9.9')).isLimited).toBe(true)
    expect((await checkPublicReportSourceHourlyLimit(admin, 'client-2', '9.9.9.9')).isLimited).toBe(true)
    expect((await checkPublicReportClientHourlyCeiling(admin, 'client-2')).isLimited).toBe(true)
  })

  it('allows when RPC says not limited', async () => {
    const admin = mockAdmin(async () => ({
      data: [{ is_limited: false, remaining: 9, reset_at: new Date(Date.now() + 60_000).toISOString() }],
      error: null,
    }))
    expect((await checkPublicReportSourceBurstLimit(admin, 'client-3', '8.8.8.8')).isLimited).toBe(false)
    expect((await checkPublicReportClientHourlyCeiling(admin, 'client-3')).isLimited).toBe(false)
  })

  it('client ceiling uses a distinct RPC key (not source IP)', async () => {
    let key = ''
    const admin = mockAdmin(async (args) => {
      key = (args as { p_key: string }).p_key
      return {
        data: [{ is_limited: false, remaining: 100, reset_at: new Date(Date.now() + 60_000).toISOString() }],
        error: null,
      }
    })
    await checkPublicReportClientHourlyCeiling(admin, 'client-ceil')
    expect(key).toBe('post:public-report:client:client-ceil:hour-ceiling')
  })
})
