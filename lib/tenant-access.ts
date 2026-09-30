import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveClientIdForUserId } from '@/lib/tenant-resolution'
import { userHasActiveResidentMembership } from '@/lib/resident-portal/memberships'

/** True when the auth user is linked to a tenant via organization_users → organizations. */
export async function userHasTenantAccess(
  admin: SupabaseClient,
  userId: string
): Promise<boolean> {
  const clientId = await resolveClientIdForUserId(admin, userId)
  return Boolean(clientId?.trim())
}

/** True when the auth user has an active resident portal membership (not org access). */
export async function userHasResidentPortalAccess(
  admin: SupabaseClient,
  userId: string
): Promise<boolean> {
  return userHasActiveResidentMembership(admin, userId)
}

export const TENANT_ACCESS_DENIED_HE =
  'אין לכם גישה למערכת. ודאו שהוזמנתם על ידי מנהל המשרד, או פנו לתמיכה.'

export const TENANT_MULTI_CLIENT_DENIED_HE =
  'החשבון משויך ליותר מלקוח אחד — פנו לתמיכת Bino לתיקון השיוך.'
