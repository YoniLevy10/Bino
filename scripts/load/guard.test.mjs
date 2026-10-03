import { describe, it, expect } from 'vitest'
import {
  assertSafeBaseUrl,
  assertWriteScenarioAllowed,
  resolveBaseUrlOrExit,
  SANDBOX_LOAD_CLIENT_ID,
} from './guard.mjs'

describe('load guard — BASE_URL', () => {
  it('allows local default', () => {
    const r = assertSafeBaseUrl('http://127.0.0.1:3000')
    expect(r.ok).toBe(true)
    expect(r.baseUrl).toBe('http://127.0.0.1:3000')
  })

  it('hard-fails bino.casa always', () => {
    for (const url of [
      'https://bino.casa',
      'http://bino.casa',
      'https://bino.casa/',
      'https://www.bino.casa/login',
      'https://preview.bino.casa',
    ]) {
      const r = assertSafeBaseUrl(url, { allowProdLoad: 'I_UNDERSTAND' })
      expect(r.ok).toBe(false)
      expect(r.reason).toMatch(/bino\.casa/)
    }
  })

  it('hard-fails supabase host without override', () => {
    const r = assertSafeBaseUrl('https://jsliqlmjksintyigkulq.supabase.co')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/Supabase|ALLOW_PROD_LOAD/)
  })

  it('allows non-bino staging only with ALLOW_PROD_LOAD=I_UNDERSTAND', () => {
    const denied = assertSafeBaseUrl('https://jsliqlmjksintyigkulq.supabase.co')
    expect(denied.ok).toBe(false)
    const allowed = assertSafeBaseUrl('https://jsliqlmjksintyigkulq.supabase.co', {
      allowProdLoad: 'I_UNDERSTAND',
    })
    expect(allowed.ok).toBe(true)
  })

  it('resolveBaseUrlOrExit defaults to loopback', () => {
    const url = resolveBaseUrlOrExit({})
    expect(url).toBe('http://127.0.0.1:3000')
  })

  it('resolveBaseUrlOrExit throws on bino.casa', () => {
    expect(() => resolveBaseUrlOrExit({ BASE_URL: 'https://bino.casa' })).toThrow(/HARD FAIL|bino\.casa/)
  })
})

describe('load guard — writes', () => {
  it('requires LOAD_ALLOW_WRITES=1 and sandbox UUID', () => {
    expect(assertWriteScenarioAllowed({ allowWrites: '', clientId: SANDBOX_LOAD_CLIENT_ID }).ok).toBe(
      false,
    )
    expect(
      assertWriteScenarioAllowed({
        allowWrites: '1',
        clientId: '00000000-0000-0000-0000-000000000000',
      }).ok,
    ).toBe(false)
    expect(
      assertWriteScenarioAllowed({
        allowWrites: '1',
        clientId: SANDBOX_LOAD_CLIENT_ID,
      }).ok,
    ).toBe(true)
  })
})
