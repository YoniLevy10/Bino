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

/** Higher number = more privilege. Used to avoid accidental demotion on upsert. */
export function orgRoleRank(role: OrgUserRole): number {
  if (role === 'admin') return 3
  if (role === 'manager') return 2
  return 1
}

export function higherOrgRole(a: OrgUserRole, b: OrgUserRole): OrgUserRole {
  return orgRoleRank(a) >= orgRoleRank(b) ? a : b
}
