import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function installMemoryStorage() {
  const store = new Map<string, string>()
  const api = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    get length() {
      return store.size
    },
    key: (index: number) => [...store.keys()][index] ?? null,
  }
  vi.stubGlobal('localStorage', api)
  vi.stubGlobal('sessionStorage', api)
  vi.stubGlobal('window', globalThis)
  return store
}

describe('worker tickets cache isolation', () => {
  beforeEach(() => {
    installMemoryStorage()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('keys cache by workerId and never returns another worker blob', async () => {
    const {
      readWorkerTicketsCache,
      writeWorkerTicketsCache,
      WORKER_TICKETS_CACHE_LEGACY_KEY,
      workerTicketsCacheKey,
    } = await import('@/lib/worker-offline-cache')

    localStorage.setItem(WORKER_TICKETS_CACHE_LEGACY_KEY, JSON.stringify({ tickets: [{ id: 'legacy' }] }))

    writeWorkerTicketsCache('worker-a', [{ id: 'a1', status: 'NEW' }])
    writeWorkerTicketsCache('worker-b', [{ id: 'b1', status: 'IN_PROGRESS' }])

    expect(readWorkerTicketsCache('worker-a')?.tickets).toEqual([{ id: 'a1', status: 'NEW' }])
    expect(readWorkerTicketsCache('worker-b')?.tickets).toEqual([{ id: 'b1', status: 'IN_PROGRESS' }])
    expect(readWorkerTicketsCache('worker-a')?.tickets).not.toEqual(
      readWorkerTicketsCache('worker-b')?.tickets
    )
    expect(localStorage.getItem(WORKER_TICKETS_CACHE_LEGACY_KEY)).toBeNull()
    expect(localStorage.getItem(workerTicketsCacheKey('worker-a'))).toBeTruthy()
  })

  it('clearAllWorkerTicketsCaches wipes v2 keys and legacy blob', async () => {
    const {
      clearAllWorkerTicketsCaches,
      writeWorkerTicketsCache,
      readWorkerTicketsCache,
      WORKER_TICKETS_CACHE_LEGACY_KEY,
    } = await import('@/lib/worker-offline-cache')

    writeWorkerTicketsCache('worker-a', [{ id: 'a1', status: 'NEW' }])
    localStorage.setItem(WORKER_TICKETS_CACHE_LEGACY_KEY, 'x')
    clearAllWorkerTicketsCaches()
    expect(readWorkerTicketsCache('worker-a')).toBeNull()
    expect(localStorage.getItem(WORKER_TICKETS_CACHE_LEGACY_KEY)).toBeNull()
  })
})

describe('GET /api/worker/bootstrap', () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('returns profile + tickets + stamp flag for a valid token', async () => {
    const resolveWorkerFromToken = vi.fn().mockResolvedValue({
      id: 'w1',
      client_id: 'c1',
      full_name: 'דני',
    })
    const clientHasPaidAddon = vi.fn().mockResolvedValue(true)
    const checkIpPostRouteLimit = vi.fn().mockResolvedValue({ isLimited: false })
    const ticketsEq = vi.fn().mockReturnThis()
    const ticketsSelect = vi.fn().mockReturnValue({
      eq: ticketsEq,
      is: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [{ id: 't1', ticket_number: 1, status: 'NEW', description: 'דליפה' }],
        error: null,
      }),
    })
    // chain: select().eq().eq().is().neq().order()
    const chain: Record<string, unknown> = {}
    const makeChain = () => {
      const c: Record<string, unknown> = {}
      c.eq = vi.fn(() => c)
      c.is = vi.fn(() => c)
      c.neq = vi.fn(() => c)
      c.order = vi.fn().mockResolvedValue({
        data: [{ id: 't1', ticket_number: 1, status: 'NEW', description: 'דליפה' }],
        error: null,
      })
      c.select = vi.fn(() => c)
      return c
    }
    const from = vi.fn(() => makeChain())

    vi.doMock('@/lib/supabase-admin', () => ({
      getSupabaseAdmin: () => ({ from }),
    }))
    vi.doMock('@/lib/worker-token-auth', () => ({ resolveWorkerFromToken }))
    vi.doMock('@/lib/paid-addons', () => ({
      clientHasPaidAddon,
      PAID_ADDON_KEYS: { worker_stamp: 'worker_stamp' },
    }))
    vi.doMock('@/lib/rate-limit', () => ({ checkIpPostRouteLimit }))
    vi.doMock('@/lib/api-validation', () => ({
      sanitizeId: (v: string | null) => v,
    }))

    const { GET } = await import('@/app/api/worker/bootstrap/route')
    const req = {
      headers: { get: () => '1.2.3.4' },
      nextUrl: { searchParams: new URLSearchParams({ token: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }) },
    } as unknown as import('next/server').NextRequest

    const res = await GET(req)
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.worker_id).toBe('w1')
    expect(json.client_id).toBe('c1')
    expect(json.full_name).toBe('דני')
    expect(json.worker_stamp_enabled).toBe(true)
    expect(json.tickets).toHaveLength(1)
    expect(resolveWorkerFromToken).toHaveBeenCalledTimes(1)
    expect(clientHasPaidAddon).toHaveBeenCalled()
  })

  it('returns 404 for an invalid token', async () => {
    vi.doMock('@/lib/supabase-admin', () => ({
      getSupabaseAdmin: () => ({ from: vi.fn() }),
    }))
    vi.doMock('@/lib/worker-token-auth', () => ({
      resolveWorkerFromToken: vi.fn().mockResolvedValue(null),
    }))
    vi.doMock('@/lib/paid-addons', () => ({
      clientHasPaidAddon: vi.fn(),
      PAID_ADDON_KEYS: { worker_stamp: 'worker_stamp' },
    }))
    vi.doMock('@/lib/rate-limit', () => ({
      checkIpPostRouteLimit: vi.fn().mockResolvedValue({ isLimited: false }),
    }))
    vi.doMock('@/lib/api-validation', () => ({
      sanitizeId: (v: string | null) => v,
    }))

    const { GET } = await import('@/app/api/worker/bootstrap/route')
    const req = {
      headers: { get: () => '1.2.3.4' },
      nextUrl: { searchParams: new URLSearchParams({ token: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }) },
    } as unknown as import('next/server').NextRequest

    const res = await GET(req)
    expect(res.status).toBe(404)
  })
})
