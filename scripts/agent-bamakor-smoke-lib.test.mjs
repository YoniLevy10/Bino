import { describe, expect, it } from 'vitest'
import {
  assertBamakorSmokeBase,
  expectLoginRedirect,
  expectNotServerError,
  expectUnauthorizedCron,
  runBamakorSmoke,
} from '../scripts/agent-bamakor-smoke-lib.mjs'

describe('assertBamakorSmokeBase', () => {
  it('allows bamakor.vercel.app', () => {
    expect(assertBamakorSmokeBase('https://bamakor.vercel.app')).toEqual({
      ok: true,
      origin: 'https://bamakor.vercel.app',
    })
  })

  it('allows bino.casa', () => {
    expect(assertBamakorSmokeBase('https://bino.casa/')).toEqual({
      ok: true,
      origin: 'https://bino.casa',
    })
  })

  it('rejects http and unknown hosts', () => {
    expect(assertBamakorSmokeBase('http://bamakor.vercel.app').ok).toBe(false)
    expect(assertBamakorSmokeBase('https://example.com').ok).toBe(false)
  })
})

describe('expect helpers', () => {
  it('accepts 308 to canonical login', () => {
    expect(expectLoginRedirect(308, 'https://bino.casa/login').ok).toBe(true)
  })

  it('rejects 5xx webhook', () => {
    expect(expectNotServerError(403).ok).toBe(true)
    expect(expectNotServerError(500).ok).toBe(false)
  })

  it('requires 401 for cron without secret', () => {
    expect(expectUnauthorizedCron(401).ok).toBe(true)
    expect(expectUnauthorizedCron(200).ok).toBe(false)
  })
})

describe('runBamakorSmoke', () => {
  it('passes against a stubbed live shape', async () => {
    /** @type {typeof fetch} */
    const fetchImpl = async (input) => {
      const url = String(input)
      if (url.endsWith('/login') && url.includes('bamakor')) {
        return new Response(null, {
          status: 308,
          headers: { location: 'https://bino.casa/login' },
        })
      }
      if (url === 'https://bino.casa/login') {
        return new Response('<html></html>', { status: 200 })
      }
      if (url.includes('/api/webhook/whatsapp')) {
        return new Response('Forbidden', { status: 403 })
      }
      if (url.includes('/api/cron/health-check')) {
        return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
      }
      return new Response('nope', { status: 404 })
    }

    const result = await runBamakorSmoke({
      baseUrl: 'https://bamakor.vercel.app',
      fetchImpl,
    })
    expect(result.ok).toBe(true)
    expect(result.lines.every((l) => l.startsWith('PASS'))).toBe(true)
  })

  it('fails when login redirect is broken', async () => {
    const fetchImpl = async () => new Response('oops', { status: 500 })
    const result = await runBamakorSmoke({
      baseUrl: 'https://bamakor.vercel.app',
      fetchImpl,
    })
    expect(result.ok).toBe(false)
    expect(result.lines.some((l) => l.startsWith('FAIL'))).toBe(true)
  })
})
