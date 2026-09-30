import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  MIDDLEWARE_TENANT_COOKIE,
  MIDDLEWARE_TENANT_TTL_SEC,
  clearMiddlewareTenantCache,
  readMiddlewareTenantCache,
  writeMiddlewareTenantCache,
} from '@/lib/middleware-tenant-cache'
import { NextRequest, NextResponse } from 'next/server'

function reqWithCookie(value: string | undefined): NextRequest {
  const headers = new Headers()
  if (value) headers.set('cookie', `${MIDDLEWARE_TENANT_COOKIE}=${value}`)
  return new NextRequest('https://example.com/dashboard', { headers })
}

describe('middleware-tenant-cache', () => {
  const prevServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  const prevCookieSecret = process.env.MIDDLEWARE_TENANT_COOKIE_SECRET

  beforeEach(() => {
    // HMAC signing requires a secret; CI unit tests do not inject service role.
    process.env.MIDDLEWARE_TENANT_COOKIE_SECRET = 'unit-test-middleware-tenant-cookie-secret'
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  afterEach(() => {
    if (prevServiceRole === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevServiceRole
    if (prevCookieSecret === undefined) delete process.env.MIDDLEWARE_TENANT_COOKIE_SECRET
    else process.env.MIDDLEWARE_TENANT_COOKIE_SECRET = prevCookieSecret
  })

  it('round-trips clientId + nav features for matching uid', async () => {
    const res = NextResponse.next()
    await writeMiddlewareTenantCache(res, {
      uid: 'user-1',
      clientId: 'client-abc',
      enabledNavFeatures: ['dashboard', 'tickets'],
    })
    const setCookie = res.cookies.get(MIDDLEWARE_TENANT_COOKIE)?.value
    expect(setCookie).toBeTruthy()

    const hit = await readMiddlewareTenantCache(reqWithCookie(setCookie), 'user-1')
    expect(hit?.clientId).toBe('client-abc')
    expect(hit?.enabledNavFeatures).toEqual(['dashboard', 'tickets'])
  })

  it('misses when uid does not match', async () => {
    const res = NextResponse.next()
    await writeMiddlewareTenantCache(res, {
      uid: 'user-1',
      clientId: 'client-abc',
      enabledNavFeatures: null,
    })
    const setCookie = res.cookies.get(MIDDLEWARE_TENANT_COOKIE)?.value
    expect(await readMiddlewareTenantCache(reqWithCookie(setCookie), 'other-user')).toBeNull()
  })

  it('clear sets maxAge 0', async () => {
    const res = NextResponse.next()
    await writeMiddlewareTenantCache(res, {
      uid: 'user-1',
      clientId: 'client-abc',
      enabledNavFeatures: null,
    })
    clearMiddlewareTenantCache(res)
    const cleared = res.cookies.get(MIDDLEWARE_TENANT_COOKIE)
    expect(cleared?.value).toBe('')
    expect(cleared?.maxAge).toBe(0)
  })

  it('exports a 5-minute TTL', () => {
    expect(MIDDLEWARE_TENANT_TTL_SEC).toBe(300)
  })

  it('rejects unsigned / forged payloads', async () => {
    const forged = btoa(
      JSON.stringify({
        uid: 'user-1',
        clientId: 'evil-client',
        enabledNavFeatures: ['collections'],
        ts: Date.now(),
      })
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
    expect(await readMiddlewareTenantCache(reqWithCookie(forged), 'user-1')).toBeNull()
  })
})
