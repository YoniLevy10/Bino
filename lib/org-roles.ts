import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export type OrgUserRole = 'admin' | 'manager' | 'viewer'

const ROLE_RANK: Record<OrgUserRole, number> = {
  viewer: 1,
  manager: 2,
  admin: 3,
}

/** Legacy/null roles default to admin (historical DEFAULT on organization_users). */
export function parseOrgUserRole(raw: unknown): OrgUserRole {
  if (raw === 'admin' || raw === 'manager' || raw === 'viewer') return raw
  return 'admin'
}

export function roleAtLeast(role: OrgUserRole, min: OrgUserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min]
}

/** Callers may only assign a role at or below their own; viewers cannot invite. */
export function canAssignOrgRole(actor: OrgUserRole, target: OrgUserRole): boolean {
  if (actor === 'viewer') return false
  return ROLE_RANK[actor] >= ROLE_RANK[target]
}

export async function resolveOrgRoleForUser(
  admin: SupabaseClient,
  userId: string,
  clientId: string
): Promise<OrgUserRole | null> {
  const { data: orgRows, error: orgErr } = await admin
    .from('organizations')
    .select('id')
    .eq('client_id', clientId)
    .limit(1)

  if (orgErr || !orgRows?.length) return null
  const orgId = (orgRows[0] as { id: string }).id

  const { data: ou, error: ouErr } = await admin
    .from('organization_users')
    .select('role')
    .eq('organization_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()

  if (ouErr || !ou) return null
  return parseOrgUserRole((ou as { role?: unknown }).role)
}

export function forbiddenRoleResponse(): NextResponse {
  return NextResponse.json({ error: 'אין הרשאה לביצוע פעולה זו' }, { status: 403 })
}
