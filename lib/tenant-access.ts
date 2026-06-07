import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveClientIdForUserId } from '@/lib/tenant-resolution'

/** True when the auth user is linked to a tenant via organization_users → organizations. */
export async function userHasTenantAccess(
  admin: SupabaseClient,
  userId: string
): Promise<boolean> {
  const clientId = await resolveClientIdForUserId(admin, userId)
  return Boolean(clientId?.trim())
}

export const TENANT_ACCESS_DENIED_HE =
  'אין לכם גישה למערכת. ודאו שהוזמנתם על ידי מנהל המשרד, או פנו לתמיכה.'
