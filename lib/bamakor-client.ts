import { supabase } from '@/lib/supabase'
import { resolveClientIdForUserId } from '@/lib/tenant-resolution'
import { TENANT_CID_SESSION_KEY } from '@/lib/tenant-browser-cache'

/**
 * מזהה `clients.id` לדפדפן לפי המשתמש המחובר:
 * organization_users → organizations.client_id
 *
 * Fallback לפיתוח: NEXT_PUBLIC_BAMAKOR_CLIENT_ID רק כש־NODE_ENV=development
 * ורק אם אין שיוך ארגון (אחרי ניסיון getUser + שרשרת org).
 */
const CID_CACHE_KEY = TENANT_CID_SESSION_KEY
const CID_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function readCidCache(userId: string): string | null {
  try {
    const raw = sessionStorage.getItem(CID_CACHE_KEY)
    if (!raw) return null
    const { cid, uid, ts } = JSON.parse(raw) as { cid: string; uid: string; ts: number }
    if (uid === userId && cid && Date.now() - ts < CID_CACHE_TTL) return cid
  } catch {}
  return null
}

function writeCidCache(userId: string, cid: string) {
  try {
    sessionStorage.setItem(CID_CACHE_KEY, JSON.stringify({ cid, uid: userId, ts: Date.now() }))
  } catch {}
}

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

  // Cache hit — skip the 2 DB queries (organization_users + organizations)
  const cached = readCidCache(user.id)
  if (cached) return cached

  const resolved = await resolveClientIdForUserId(supabase, user.id)
  if (resolved) {
    writeCidCache(user.id, resolved)
    return resolved
  }

  const explicit = (process.env.NEXT_PUBLIC_BAMAKOR_CLIENT_ID || '').trim()
  if (process.env.NODE_ENV === 'development' && explicit) {
    return explicit
  }

  throw new Error('לא נמצא client_id לארגון — פנו לתמיכה')
}
