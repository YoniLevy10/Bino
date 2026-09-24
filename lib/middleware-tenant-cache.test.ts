import { describe, expect, it } from 'vitest'
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
  it('round-trips clientId + nav features for matching uid', () => {
    const res = NextResponse.next()
    writeMiddlewareTenantCache(res, {
      uid: 'user-1',
      clientId: 'client-abc',
      enabledNavFeatures: ['dashboard', 'tickets'],
    })
    const setCookie = res.cookies.get(MIDDLEWARE_TENANT_COOKIE)?.value
    expect(setCookie).toBeTruthy()

    const hit = readMiddlewareTenantCache(reqWithCookie(setCookie), 'user-1')
    expect(hit?.clientId).toBe('client-abc')
    expect(hit?.enabledNavFeatures).toEqual(['dashboard', 'tickets'])
  })

  it('misses when uid does not match', () => {
    const res = NextResponse.next()
    writeMiddlewareTenantCache(res, {
      uid: 'user-1',
      clientId: 'client-abc',
      enabledNavFeatures: null,
    })
    const setCookie = res.cookies.get(MIDDLEWARE_TENANT_COOKIE)?.value
    expect(readMiddlewareTenantCache(reqWithCookie(setCookie), 'other-user')).toBeNull()
  })

  it('clear sets maxAge 0', () => {
    const res = NextResponse.next()
    writeMiddlewareTenantCache(res, {
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
})
