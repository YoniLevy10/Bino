import { describe, expect, it, vi, beforeEach } from 'vitest'

const exchangeMock = vi.fn()
const getUserMock = vi.fn()
const signOutMock = vi.fn()
const createServerClientMock = vi.fn()

vi.mock('@supabase/ssr', () => ({
  createServerClient: (...args: unknown[]) => createServerClientMock(...args),
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: 'bino.casa', 'x-forwarded-proto': 'https' }),
}))

vi.mock('@/lib/site-url', () => ({
  getPublicSiteUrlFromHeaders: () => 'https://bino.casa',
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({ from: vi.fn() }),
}))

vi.mock('@/lib/tenant-access', () => ({
  userHasTenantAccess: vi.fn(async () => true),
}))

vi.mock('@/lib/resident-portal/memberships', () => ({
  userHasActiveResidentMembership: vi.fn(async () => false),
}))

vi.mock('@/lib/google-calendar', () => ({
  upsertGoogleCalendarConnection: vi.fn(),
}))

vi.mock('@/lib/singleton-client-server', () => ({
  getSingletonClientId: vi.fn(async () => 'client-1'),
}))

describe('auth/callback cookie attachment', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key'
    exchangeMock.mockResolvedValue({ data: { session: { expires_in: 3600 } }, error: null })
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@b.com' } } })
    signOutMock.mockResolvedValue({})
    createServerClientMock.mockImplementation((_url, _key, opts: { cookies: { setAll: (c: unknown) => void } }) => {
      return {
        auth: {
          exchangeCodeForSession: async (code: string) => {
            // Simulate SSR adapter writing session cookies during exchange.
            opts.cookies.setAll([
              { name: 'sb-example-auth-token', value: 'session-cookie', options: { path: '/' } },
            ])
            return exchangeMock(code)
          },
          getUser: getUserMock,
          signOut: signOutMock,
        },
      }
    })
  })

  it('puts exchange session cookies on the redirect response', async () => {
    const { GET } = await import('@/app/auth/callback/route')
    const req = new Request('https://bino.casa/auth/callback?code=abc&next=/dashboard')
    const res = await GET(req as never)
    expect(res.status).toBeGreaterThanOrEqual(300)
    expect(res.status).toBeLessThan(400)
    expect(res.headers.get('location')).toBe('https://bino.casa/dashboard')
    const setCookie = res.headers.getSetCookie?.() ?? []
    const joined = setCookie.join(';') || String(res.headers.get('set-cookie') || '')
    expect(joined).toMatch(/sb-example-auth-token=session-cookie/)
  })
})
