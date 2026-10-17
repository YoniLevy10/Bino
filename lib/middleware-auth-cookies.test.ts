import { describe, expect, it } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import {
  applyMiddlewareSupabaseCookies,
  redirectWithMiddlewareCookies,
} from '@/lib/middleware-auth-cookies'
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

  it('forwards rotated refresh onto request so handlers do not 401 on stale token', () => {
    const req = new NextRequest('https://bino.casa/dashboard', {
      headers: { cookie: 'sb-refresh-token=old-refresh' },
    })
    const pending = { response: NextResponse.next() }

    applyMiddlewareSupabaseCookies(req, pending, [
      { name: 'sb-refresh-token', value: 'rotated-refresh', options: { path: '/', maxAge: 3600 } },
      { name: 'sb-access-token', value: 'rotated-access', options: { path: '/', maxAge: 3600 } },
    ])

    expect(req.cookies.get('sb-refresh-token')?.value).toBe('rotated-refresh')
    expect(req.cookies.get('sb-access-token')?.value).toBe('rotated-access')
  })
})

describe('redirectWithMiddlewareCookies', () => {
  it('preserves queued Set-Cookie on login redirect (invalid/missing session)', () => {
    const pending = { response: NextResponse.next() }
    pending.response.cookies.set('sb-access-token', 'rotated', {
      path: '/',
      maxAge: 3600,
      httpOnly: true,
    })
    pending.response.cookies.set(MIDDLEWARE_TENANT_COOKIE, '', {
      path: '/',
      maxAge: 0,
    })

    const url = new URL('https://bino.casa/login?redirectTo=%2Fdashboard')
    const redirect = redirectWithMiddlewareCookies(pending, url)

    expect(redirect.status).toBeGreaterThanOrEqual(300)
    expect(redirect.status).toBeLessThan(400)
    expect(redirect.headers.get('location')).toContain('/login')
    const names = cookieNames(redirect)
    expect(names).toContain('sb-access-token')
    expect(names).toContain(MIDDLEWARE_TENANT_COOKIE)
    const accessHeader = redirect.headers.getSetCookie().find((h) => h.startsWith('sb-access-token='))
    expect(accessHeader).toMatch(/Max-Age=3600/i)
  })
})

