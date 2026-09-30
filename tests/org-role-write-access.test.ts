import { describe, expect, it } from 'vitest'
import { canOrgRoleWrite, isOrgUserRole } from '@/lib/org-role'

describe('org role write gate (audit #04)', () => {
  it('recognizes roles', () => {
    expect(isOrgUserRole('admin')).toBe(true)
    expect(isOrgUserRole('manager')).toBe(true)
    expect(isOrgUserRole('viewer')).toBe(true)
    expect(isOrgUserRole('owner')).toBe(false)
  })

  it('viewer cannot write; admin/manager can', () => {
    expect(canOrgRoleWrite('viewer')).toBe(false)
    expect(canOrgRoleWrite('admin')).toBe(true)
    expect(canOrgRoleWrite('manager')).toBe(true)
    expect(canOrgRoleWrite(null)).toBe(false)
  })
})
