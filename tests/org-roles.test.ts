import { describe, expect, it, afterEach } from 'vitest'
import { canAssignOrgRole, parseOrgUserRole, roleAtLeast } from '@/lib/org-roles'
import { secureStringEqual } from '@/lib/secure-compare'
import { verifyCronRequest } from '@/lib/cron-auth'
import { NextRequest } from 'next/server'

describe('org roles', () => {
  it('parses known roles and defaults legacy null to admin', () => {
    expect(parseOrgUserRole('viewer')).toBe('viewer')
    expect(parseOrgUserRole('manager')).toBe('manager')
    expect(parseOrgUserRole('admin')).toBe('admin')
    expect(parseOrgUserRole(null)).toBe('admin')
    expect(parseOrgUserRole('nope')).toBe('admin')
  })

  it('compares role ranks', () => {
    expect(roleAtLeast('admin', 'manager')).toBe(true)
    expect(roleAtLeast('manager', 'manager')).toBe(true)
    expect(roleAtLeast('viewer', 'manager')).toBe(false)
  })

  it('limits role assignment', () => {
    expect(canAssignOrgRole('admin', 'admin')).toBe(true)
    expect(canAssignOrgRole('manager', 'manager')).toBe(true)
    expect(canAssignOrgRole('manager', 'admin')).toBe(false)
    expect(canAssignOrgRole('viewer', 'viewer')).toBe(false)
  })
})

describe('secureStringEqual', () => {
  it('matches equal secrets', () => {
    expect(secureStringEqual('abc', 'abc')).toBe(true)
    expect(secureStringEqual('abc', 'abd')).toBe(false)
    expect(secureStringEqual('abc', 'ab')).toBe(false)
  })
})

describe('verifyCronRequest', () => {
  const prev = process.env.CRON_SECRET

  afterEach(() => {
    if (prev === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = prev
  })

  it('accepts bearer only (rejects query secret)', () => {
    process.env.CRON_SECRET = 'cron-test-secret'
    const ok = verifyCronRequest(
      new NextRequest('http://localhost/api/cron/health-check', {
        headers: { authorization: 'Bearer cron-test-secret' },
      })
    )
    const viaQuery = verifyCronRequest(
      new NextRequest('http://localhost/api/cron/health-check?secret=cron-test-secret')
    )
    expect(ok).toBe(true)
    expect(viaQuery).toBe(false)
  })

  it('fails closed when secret unset', () => {
    delete process.env.CRON_SECRET
    const ok = verifyCronRequest(
      new NextRequest('http://localhost/api/cron/health-check', {
        headers: { authorization: 'Bearer anything' },
      })
    )
    expect(ok).toBe(false)
  })
})
