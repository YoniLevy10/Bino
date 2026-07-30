import { describe, expect, it, vi, beforeEach } from 'vitest'

const requireSessionMinRole = vi.fn()
const checkAuthenticatedPostRouteLimit = vi.fn()
const maybeSingle = vi.fn()

vi.mock('@/lib/api-auth', () => ({
  requireSessionMinRole: (...args: unknown[]) => requireSessionMinRole(...args),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkAuthenticatedPostRouteLimit: (...args: unknown[]) => checkAuthenticatedPostRouteLimit(...args),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: () => maybeSingle(),
            }),
          }),
        }),
      }),
    }),
  }),
}))

vi.mock('@/lib/public-app-url', () => ({
  getWorkerPortalUrl: (token: string) => `https://bamakor.vercel.app/worker?token=${token}`,
}))

describe('POST /api/workers/portal-link', () => {
  beforeEach(() => {
    vi.resetModules()
    requireSessionMinRole.mockReset()
    checkAuthenticatedPostRouteLimit.mockReset()
    maybeSingle.mockReset()
    requireSessionMinRole.mockResolvedValue({
      ok: true,
      ctx: { userId: 'u1', clientId: 'c1', role: 'manager', admin: {} },
    })
    checkAuthenticatedPostRouteLimit.mockResolvedValue({ isLimited: false })
  })

  it('returns portal URL from server-side access_token', async () => {
    maybeSingle.mockResolvedValue({
      data: { id: 'w1', access_token: '11111111-1111-4111-8111-111111111111', is_active: true },
      error: null,
    })
    const { POST } = await import('@/app/api/workers/portal-link/route')
    const res = await POST(
      new Request('http://localhost/api/workers/portal-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ worker_id: '22222222-2222-4222-8222-222222222222' }),
      })
    )
    expect(res.status).toBe(200)
    const json = (await res.json()) as { ok: boolean; url: string }
    expect(json.ok).toBe(true)
    expect(json.url).toContain('/worker?token=11111111-1111-4111-8111-111111111111')
  })

  it('forbids when session role check fails', async () => {
    requireSessionMinRole.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'אין הרשאה' }), { status: 403 }),
    })
    const { POST } = await import('@/app/api/workers/portal-link/route')
    const res = await POST(
      new Request('http://localhost/api/workers/portal-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ worker_id: '22222222-2222-4222-8222-222222222222' }),
      })
    )
    expect(res.status).toBe(403)
  })
})
