import { describe, expect, it } from 'vitest'
import { canOrgRoleWrite, higherOrgRole, isOrgUserRole, orgRoleRank } from '@/lib/org-role'

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

  it('ranks and never demotes via higherOrgRole', () => {
    expect(orgRoleRank('admin')).toBeGreaterThan(orgRoleRank('manager'))
    expect(orgRoleRank('manager')).toBeGreaterThan(orgRoleRank('viewer'))
    expect(higherOrgRole('admin', 'viewer')).toBe('admin')
    expect(higherOrgRole('viewer', 'manager')).toBe('manager')
  })
})
