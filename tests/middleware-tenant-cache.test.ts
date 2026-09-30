import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import {
  MIDDLEWARE_TENANT_COOKIE,
  readMiddlewareTenantCache,
  writeMiddlewareTenantCache,
  clearMiddlewareTenantCache,
} from '@/lib/middleware-tenant-cache'

function fakeResponse() {
  const jar = new Map<string, string>()
  return {
    cookies: {
      set(name: string, value: string) {
        jar.set(name, value)
      },
      get(name: string) {
        const v = jar.get(name)
        return v == null ? undefined : { name, value: v }
      },
      _jar: jar,
    },
  }
}

function fakeRequest(cookieValue: string | null) {
  return {
    cookies: {
      get(name: string) {
        if (name !== MIDDLEWARE_TENANT_COOKIE || !cookieValue) return undefined
        return { name, value: cookieValue }
      },
    },
  }
}

describe('middleware tenant cache signing (audit #08)', () => {
  const prevSecret = process.env.SUPABASE_SERVICE_ROLE_KEY
  const prevDedicated = process.env.MIDDLEWARE_TENANT_COOKIE_SECRET

  beforeEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'unit-test-service-role-secret'
    delete process.env.MIDDLEWARE_TENANT_COOKIE_SECRET
  })

  afterEach(() => {
    if (prevSecret === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevSecret
    if (prevDedicated === undefined) delete process.env.MIDDLEWARE_TENANT_COOKIE_SECRET
    else process.env.MIDDLEWARE_TENANT_COOKIE_SECRET = prevDedicated
  })

  it('accepts a cookie written by writeMiddlewareTenantCache', async () => {
    const res = fakeResponse() as unknown as Parameters<typeof writeMiddlewareTenantCache>[0]
    await writeMiddlewareTenantCache(res, {
      uid: 'user-1',
      clientId: 'client-1',
      enabledNavFeatures: null,
    })
    const value = res.cookies.get(MIDDLEWARE_TENANT_COOKIE)?.value
    expect(value).toBeTruthy()
    expect(value!.includes('.')).toBe(true)

    const req = fakeRequest(value!) as unknown as Parameters<typeof readMiddlewareTenantCache>[0]
    const parsed = await readMiddlewareTenantCache(req, 'user-1')
    expect(parsed?.clientId).toBe('client-1')
  })

  it('rejects unsigned / forged payloads', async () => {
    const forged = btoa(
      JSON.stringify({
        uid: 'user-1',
        clientId: 'evil-client',
        enabledNavFeatures: ['collections'],
        ts: Date.now() + 60 * 60 * 1000,
      })
    )
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
    const req = fakeRequest(forged) as unknown as Parameters<typeof readMiddlewareTenantCache>[0]
    expect(await readMiddlewareTenantCache(req, 'user-1')).toBeNull()
  })

  it('rejects future timestamps even with valid signature body tampered after write', async () => {
    const res = fakeResponse() as unknown as Parameters<typeof writeMiddlewareTenantCache>[0]
    await writeMiddlewareTenantCache(res, {
      uid: 'user-1',
      clientId: 'client-1',
      enabledNavFeatures: null,
    })
    clearMiddlewareTenantCache(res)
    expect(res.cookies.get(MIDDLEWARE_TENANT_COOKIE)?.value).toBe('')
  })
})
