import type { SupabaseClient } from '@supabase/supabase-js'
import { isOrgUserRole, type OrgUserRole } from '@/lib/org-role'
import { createProcessMemoryCache } from '@/lib/process-memory-cache'

const ROLE_TTL_MS = 60_000
const roleByUserClientCache = createProcessMemoryCache<OrgUserRole | null>(ROLE_TTL_MS)

/**
 * Resolve organization_users.role for a user within a client's organization.
 * Returns null when membership is missing.
 */
export async function resolveOrgRoleForUserClient(
  admin: SupabaseClient,
  userId: string,
  clientId: string
): Promise<OrgUserRole | null> {
  const cacheKey = `${userId}:${clientId}`
  const cached = roleByUserClientCache.get(cacheKey)
  if (cached !== undefined) return cached

  const { data: orgRows, error: orgErr } = await admin
    .from('organizations')
    .select('id')
    .eq('client_id', clientId)
    .eq('is_active', true)

  if (orgErr) {
    throw new Error(`ORGS_ROLE_QUERY_FAILED: ${orgErr.message}`)
  }
  if (!orgRows?.length) {
    roleByUserClientCache.set(cacheKey, null)
    return null
  }

  const orgIds = orgRows.map((r) => (r as { id: string }).id)

  const { data: ouRows, error: ouErr } = await admin
    .from('organization_users')
    .select('role, organization_id')
    .eq('user_id', userId)
    .in('organization_id', orgIds)
    .limit(5)

  if (ouErr) {
    throw new Error(`ORG_USERS_ROLE_QUERY_FAILED: ${ouErr.message}`)
  }
  if (!ouRows?.length) {
    roleByUserClientCache.set(cacheKey, null)
    return null
  }

  // Prefer highest privilege if multiple rows somehow exist.
  const roles = ouRows
    .map((r) => (r as { role?: unknown }).role)
    .filter(isOrgUserRole)
  let role: OrgUserRole | null = null
  if (roles.includes('admin')) role = 'admin'
  else if (roles.includes('manager')) role = 'manager'
  else if (roles.includes('viewer')) role = 'viewer'

  roleByUserClientCache.set(cacheKey, role)
  return role
}

/** Test / sign-out hook — drop cached roles for this process. */
export function clearOrgRoleResolveCache(): void {
  roleByUserClientCache.clear()
}
