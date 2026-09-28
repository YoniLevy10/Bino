import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearWorkerPortalBranding,
  readWorkerPortalBranding,
  tryReadWorkerPortalBranding,
  writeWorkerPortalBranding,
  WORKER_BRANDING_LAST_KEY,
} from '@/lib/worker-branding'

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
  return store
}

describe('worker portal branding cache', () => {
  beforeEach(() => {
    installMemoryStorage()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('writes and reads branding by client id', () => {
    writeWorkerPortalBranding({
      clientId: 'c1',
      displayName: 'במקור',
      logoUrl: 'https://cdn.example/logo.png',
    })
    expect(readWorkerPortalBranding('c1')).toEqual({
      clientId: 'c1',
      displayName: 'במקור',
      logoUrl: 'https://cdn.example/logo.png',
    })
    expect(localStorage.getItem(WORKER_BRANDING_LAST_KEY)).toBe('c1')
    expect(tryReadWorkerPortalBranding()?.logoUrl).toBe('https://cdn.example/logo.png')
  })

  it('clearWorkerPortalBranding removes keys', () => {
    writeWorkerPortalBranding({
      clientId: 'c1',
      displayName: 'במקור',
      logoUrl: null,
    })
    clearWorkerPortalBranding()
    expect(tryReadWorkerPortalBranding()).toBeNull()
    expect(readWorkerPortalBranding('c1')).toBeNull()
  })
})
