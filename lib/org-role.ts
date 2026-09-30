/**
 * Organization membership roles for dashboard users.
 * `viewer` is read-only — mutating API routes must reject it.
 */
export type OrgUserRole = 'admin' | 'manager' | 'viewer'

export const ORG_WRITE_ROLES: ReadonlySet<OrgUserRole> = new Set(['admin', 'manager'])

export function isOrgUserRole(value: unknown): value is OrgUserRole {
  return value === 'admin' || value === 'manager' || value === 'viewer'
}

export function canOrgRoleWrite(role: OrgUserRole | null | undefined): boolean {
  return role != null && ORG_WRITE_ROLES.has(role)
}
