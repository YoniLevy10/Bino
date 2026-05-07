import { supabase } from '@/lib/supabase'
import { resolveClientIdForUserId } from '@/lib/tenant-resolution'

/**
 * מזהה `clients.id` לדפדפן לפי המשתמש המחובר:
 * organization_users → organizations.client_id
 *
 * Fallback לפיתוח: NEXT_PUBLIC_BAMAKOR_CLIENT_ID רק כש־NODE_ENV=development
 * ורק אם אין שיוך ארגון (אחרי ניסיון getUser + שרשרת org).
 */
export async function resolveBamakorClientIdForBrowser(): Promise<string> {
  const firstUserRes = await supabase.auth.getUser()
  let user = firstUserRes.data.user

  if (!user) {
    // After OAuth redirect there can be a short delay before browser auth state settles.
    const { data: sessionData } = await supabase.auth.getSession()
    if (sessionData.session) {
      const secondUserRes = await supabase.auth.getUser()
      user = secondUserRes.data.user
      if (!user && secondUserRes.error) {
        throw secondUserRes.error
      }
    }
  }

  if (firstUserRes.error || !user) {
    throw new Error('נדרשת התחברות')
  }

  const resolved = await resolveClientIdForUserId(supabase, user.id)
  if (resolved) {
    return resolved
  }

  const explicit = (process.env.NEXT_PUBLIC_BAMAKOR_CLIENT_ID || '').trim()
  if (process.env.NODE_ENV === 'development' && explicit) {
    return explicit
  }

  throw new Error('לא נמצא client_id לארגון — פנו לתמיכה')
}
