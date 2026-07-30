import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

describe('checkRateLimit memory fallback', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('limits via in-memory bucket when RPC fails (not fail-open)', async () => {
    const admin = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'rpc down', code: '57014' } }),
    } as unknown as SupabaseClient

    const { checkRateLimit } = await import('@/lib/rate-limit')
    const key = `mem-test-${Date.now()}-${Math.random()}`

    const first = await checkRateLimit(admin, key, 2, 60_000)
    expect(first.rpcFailed).toBe(true)
    expect(first.isLimited).toBe(false)

    const second = await checkRateLimit(admin, key, 2, 60_000)
    expect(second.isLimited).toBe(false)

    const third = await checkRateLimit(admin, key, 2, 60_000)
    expect(third.isLimited).toBe(true)
  })

  it('uses RPC result when available', async () => {
    const admin = {
      rpc: vi.fn().mockResolvedValue({
        data: { is_limited: true, remaining: 0, reset_at: new Date(Date.now() + 1000).toISOString() },
        error: null,
      }),
    } as unknown as SupabaseClient

    const { checkRateLimit } = await import('@/lib/rate-limit')
    const r = await checkRateLimit(admin, 'rpc-ok-key', 20, 60_000)
    expect(r.rpcFailed).toBeFalsy()
    expect(r.isLimited).toBe(true)
    expect(r.remaining).toBe(0)
  })
})
