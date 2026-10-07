import { describe, expect, it } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { applyMiddlewareSupabaseCookies } from '@/lib/middleware-auth-cookies'
import { MIDDLEWARE_TENANT_COOKIE } from '@/lib/middleware-tenant-cache'

function cookieNames(response: NextResponse): string[] {
  return response.headers.getSetCookie().map((header) => header.split('=')[0] ?? '')
}

describe('applyMiddlewareSupabaseCookies', () => {
  it('puts the rotated auth cookie on the request and the response', () => {
    const req = new NextRequest('https://bino.casa/api/client/nav-config', {
      headers: { cookie: 'sb-access-token=old' },
    })
    const pending = { response: NextResponse.next() }

    applyMiddlewareSupabaseCookies(req, pending, [
      { name: 'sb-access-token', value: 'fresh', options: { path: '/' } },
    ])

    expect(req.cookies.get('sb-access-token')?.value).toBe('fresh')
    expect(pending.response.cookies.get('sb-access-token')?.value).toBe('fresh')
  })

  it('keeps a tenant cookie queued before the auth rotation', () => {
    const req = new NextRequest('https://bino.casa/dashboard')
    const pending = { response: NextResponse.next() }
    pending.response.cookies.set(MIDDLEWARE_TENANT_COOKIE, 'signed-tenant', {
      httpOnly: true,
      path: '/',
    })

    applyMiddlewareSupabaseCookies(req, pending, [
      { name: 'sb-access-token', value: 'fresh', options: { path: '/' } },
    ])

    const names = cookieNames(pending.response)
    expect(names).toContain('sb-access-token')
    expect(names.filter((name) => name === MIDDLEWARE_TENANT_COOKIE)).toHaveLength(1)
    expect(names.filter((name) => name === 'sb-access-token')).toHaveLength(1)
  })

  it('drops a cleared auth cookie from the request without duplicating it', () => {
    const req = new NextRequest('https://bino.casa/login', {
      headers: { cookie: 'sb-access-token=stale' },
    })
    const pending = { response: NextResponse.next() }

    applyMiddlewareSupabaseCookies(req, pending, [
      { name: 'sb-access-token', value: '', options: { path: '/', maxAge: 0 } },
    ])

    expect(req.cookies.get('sb-access-token')).toBeUndefined()
    expect(cookieNames(pending.response).filter((name) => name === 'sb-access-token')).toHaveLength(1)
  })
})
