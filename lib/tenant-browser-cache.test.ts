import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  LAST_AUTH_UID_KEY,
  TENANT_CID_SESSION_KEY,
  tryReadSessionBoundClientId,
} from '@/lib/tenant-browser-cache'

describe('tryReadSessionBoundClientId', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
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
    store.set(LAST_AUTH_UID_KEY, 'user-1')
    store.set(
      TENANT_CID_SESSION_KEY,
      JSON.stringify({ cid: 'client-abc', uid: 'user-1', ts: Date.now() })
    )
    expect(tryReadSessionBoundClientId()).toBe('client-abc')
  })

  it('returns null when auth uid does not match', () => {
    store.set(LAST_AUTH_UID_KEY, 'user-other')
    store.set(
      TENANT_CID_SESSION_KEY,
      JSON.stringify({ cid: 'client-abc', uid: 'user-1', ts: Date.now() })
    )
    expect(tryReadSessionBoundClientId()).toBeNull()
  })
})
