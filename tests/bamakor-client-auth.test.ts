import { beforeEach, describe, expect, it, vi } from 'vitest'

const getUser = vi.fn()
const getSession = vi.fn()
const resolveClientIdForUserId = vi.fn()

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
  vi.stubGlobal('sessionStorage', api)
  vi.stubGlobal('localStorage', api)
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => getUser(...args),
      getSession: (...args: unknown[]) => getSession(...args),
    },
  },
}))

vi.mock('@/lib/tenant-resolution', () => ({
  resolveClientIdForUserId: (...args: unknown[]) => resolveClientIdForUserId(...args),
}))

vi.mock('@/lib/tenant-browser-cache', () => ({
  TENANT_CID_SESSION_KEY: 'test_cid_session',
  TENANT_CID_LOCAL_KEY: 'bamakor_cid_local_v1',
}))

describe('resolveBamakorClientIdForBrowser', () => {
  beforeEach(() => {
    vi.resetModules()
    installMemoryStorage()
    getUser.mockReset()
    getSession.mockReset()
    resolveClientIdForUserId.mockReset()
  })

  it('uses local session when getUser fails with a network error', async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Failed to fetch', name: 'AuthRetryableFetchError' },
    })
    getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    })
    resolveClientIdForUserId.mockResolvedValue('client-1')

    const { resolveBamakorClientIdForBrowser } = await import('@/lib/bamakor-client')
    await expect(resolveBamakorClientIdForBrowser()).resolves.toBe('client-1')
    expect(resolveClientIdForUserId).toHaveBeenCalled()
  })

  it('reuses localStorage cid after sessionStorage was cleared', async () => {
    // Separate stores: local survives after session clear
    const sessionStore = new Map<string, string>()
    const localStore = new Map<string, string>()
    const makeApi = (store: Map<string, string>) => ({
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, String(value))
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
      clear: () => store.clear(),
      get length() {
        return store.size
      },
      key: (index: number) => [...store.keys()][index] ?? null,
    })
    vi.stubGlobal('sessionStorage', makeApi(sessionStore))
    vi.stubGlobal('localStorage', makeApi(localStore))
    localStorage.setItem(
      'bamakor_cid_local_v1',
      JSON.stringify({ cid: 'client-cached', uid: 'user-1', ts: Date.now() })
    )
    getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    })

    const { resolveBamakorClientIdForBrowser } = await import('@/lib/bamakor-client')
    await expect(resolveBamakorClientIdForBrowser()).resolves.toBe('client-cached')
    expect(resolveClientIdForUserId).not.toHaveBeenCalled()
  })
})
