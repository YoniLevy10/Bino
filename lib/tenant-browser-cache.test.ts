import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  LAST_AUTH_UID_KEY,
  TENANT_CID_LOCAL_KEY,
  TENANT_CID_SESSION_KEY,
  tryReadSessionBoundClientId,
} from '@/lib/tenant-browser-cache'

describe('tryReadSessionBoundClientId', () => {
  const sessionStore = new Map<string, string>()
  const localStore = new Map<string, string>()

  beforeEach(() => {
    sessionStore.clear()
    localStore.clear()
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => sessionStore.get(k) ?? null,
      setItem: (k: string, v: string) => {
        sessionStore.set(k, v)
      },
      removeItem: (k: string) => {
        sessionStore.delete(k)
      },
    })
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => localStore.get(k) ?? null,
      setItem: (k: string, v: string) => {
        localStore.set(k, v)
      },
      removeItem: (k: string) => {
        localStore.delete(k)
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null when session cid is missing', () => {
    expect(tryReadSessionBoundClientId()).toBeNull()
  })

  it('returns cid when bound to current auth uid', () => {
    sessionStore.set(LAST_AUTH_UID_KEY, 'user-1')
    sessionStore.set(
      TENANT_CID_SESSION_KEY,
      JSON.stringify({ cid: 'client-abc', uid: 'user-1', ts: Date.now() })
    )
    expect(tryReadSessionBoundClientId()).toBe('client-abc')
  })

  it('returns null when auth uid does not match session entry', () => {
    sessionStore.set(LAST_AUTH_UID_KEY, 'user-other')
    sessionStore.set(
      TENANT_CID_SESSION_KEY,
      JSON.stringify({ cid: 'client-abc', uid: 'user-1', ts: Date.now() })
    )
    expect(tryReadSessionBoundClientId()).toBeNull()
  })

  it('falls back to localStorage when session cid is missing', () => {
    sessionStore.set(LAST_AUTH_UID_KEY, 'user-1')
    localStore.set(
      TENANT_CID_LOCAL_KEY,
      JSON.stringify({ cid: 'client-local', uid: 'user-1', ts: Date.now() })
    )
    expect(tryReadSessionBoundClientId()).toBe('client-local')
  })

  it('uses fresh local cid when LAST_AUTH_UID is gone (mobile tab kill)', () => {
    localStore.set(
      TENANT_CID_LOCAL_KEY,
      JSON.stringify({ cid: 'client-local', uid: 'user-1', ts: Date.now() })
    )
    expect(tryReadSessionBoundClientId()).toBe('client-local')
  })

  it('rejects expired local cid when session marker is gone', () => {
    localStore.set(
      TENANT_CID_LOCAL_KEY,
      JSON.stringify({
        cid: 'client-old',
        uid: 'user-1',
        ts: Date.now() - 25 * 60 * 60 * 1000,
      })
    )
    expect(tryReadSessionBoundClientId()).toBeNull()
  })
})
