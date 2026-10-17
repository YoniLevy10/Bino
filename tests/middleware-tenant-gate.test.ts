import { describe, expect, it } from 'vitest'
import { shouldSignOutForTenantGate } from '@/lib/middleware-tenant-gate'

describe('shouldSignOutForTenantGate', () => {
  it('signs out only for empty / multi-tenant access control', () => {
    expect(shouldSignOutForTenantGate('no_access')).toBe(true)
    expect(shouldSignOutForTenantGate('multi_tenant')).toBe(true)
  })

  it('never signs out on transient DB / admin / network failures', () => {
    expect(shouldSignOutForTenantGate('transient')).toBe(false)
  })

  it('does not sign out on successful tenant resolve', () => {
    expect(shouldSignOutForTenantGate('ok')).toBe(false)
  })
})
