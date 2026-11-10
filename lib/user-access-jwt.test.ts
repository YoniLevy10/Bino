import { describe, expect, it } from 'vitest'
import { canOrgRoleWrite } from '@/lib/org-role'
import {
  bearerFallbackJwt,
  extractUserAccessJwt,
  shouldSignOutResolvedSession,
} from '@/lib/user-access-jwt'

const USER_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature'

describe('extractUserAccessJwt', () => {
  it('returns null when there is no authorization', () => {
    expect(extractUserAccessJwt(null)).toBeNull()
    expect(extractUserAccessJwt(undefined)).toBeNull()
    expect(extractUserAccessJwt('')).toBeNull()
  })

  it('ignores cron secrets and opaque API keys', () => {
    expect(extractUserAccessJwt('Bearer cron-secret-value')).toBeNull()
    expect(extractUserAccessJwt('Bearer abc.def')).toBeNull()
    expect(extractUserAccessJwt('Basic dXNlcjpwYXNz')).toBeNull()
  })

  it('accepts a three-part user JWT', () => {
    expect(extractUserAccessJwt(`Bearer ${USER_JWT}`)).toBe(USER_JWT)
    expect(extractUserAccessJwt(`bearer ${USER_JWT}`)).toBe(USER_JWT)
  })
})

describe('bearerFallbackJwt', () => {
  it('keeps the cookie session when both are present', () => {
    expect(
      bearerFallbackJwt({
        cookieUserPresent: true,
        authorization: `Bearer ${USER_JWT}`,
        allowBearer: true,
      })
    ).toBeNull()
  })

  it('does not read a bearer token on page routes', () => {
    expect(
      bearerFallbackJwt({
        cookieUserPresent: false,
        authorization: `Bearer ${USER_JWT}`,
        allowBearer: false,
      })
    ).toBeNull()
  })

  it('uses the user JWT only when the cookie session is missing', () => {
    expect(
      bearerFallbackJwt({
        cookieUserPresent: false,
        authorization: `Bearer ${USER_JWT}`,
        allowBearer: true,
      })
    ).toBe(USER_JWT)
  })

  it('ignores a cron bearer on the mobile path', () => {
    expect(
      bearerFallbackJwt({
        cookieUserPresent: false,
        authorization: 'Bearer CRON_SECRET_VALUE',
        allowBearer: true,
      })
    ).toBeNull()
  })
})

describe('session safety', () => {
  it('does not sign out a bearer-only session', () => {
    expect(shouldSignOutResolvedSession('no_access', true)).toBe(false)
    expect(shouldSignOutResolvedSession('multi_tenant', true)).toBe(false)
    expect(shouldSignOutResolvedSession('transient', true)).toBe(false)
  })

  it('still signs out cookie sessions that fail the tenant gate', () => {
    expect(shouldSignOutResolvedSession('no_access', false)).toBe(true)
    expect(shouldSignOutResolvedSession('multi_tenant', false)).toBe(true)
    expect(shouldSignOutResolvedSession('transient', false)).toBe(false)
  })

  it('rejects viewer writes', () => {
    expect(canOrgRoleWrite('viewer')).toBe(false)
    expect(canOrgRoleWrite('manager')).toBe(true)
    expect(canOrgRoleWrite('admin')).toBe(true)
  })
})
