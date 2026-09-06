import { supabase } from '@/lib/supabase'
import { resolveClientIdForUserId } from '@/lib/tenant-resolution'
import { TENANT_CID_LOCAL_KEY, TENANT_CID_SESSION_KEY } from '@/lib/tenant-browser-cache'

/**
 * מזהה `clients.id` לדפדפן לפי המשתמש המחובר:
 * organization_users → organizations.client_id
 *
 * Fallback לפיתוח: NEXT_PUBLIC_BAMAKOR_CLIENT_ID רק כש־NODE_ENV=development
 * ורק אם אין שיוך ארגון (אחרי ניסיון getUser + שרשרת org).
 */
const CID_CACHE_KEY = TENANT_CID_SESSION_KEY
const CID_LOCAL_KEY = TENANT_CID_LOCAL_KEY
const CID_CACHE_TTL = 5 * 60 * 1000 // 5 minutes (session)
const CID_LOCAL_TTL = 24 * 60 * 60 * 1000 // 24h — survives tab kill on mobile

type CidCachePayload = { cid: string; uid: string; ts: number }

function readCidCache(userId: string): string | null {
  try {
    const raw = sessionStorage.getItem(CID_CACHE_KEY)
    if (!raw) return null
    const { cid, uid, ts } = JSON.parse(raw) as CidCachePayload
    if (uid === userId && cid && Date.now() - ts < CID_CACHE_TTL) return cid
  } catch {}
  return null
}

function readCidLocalCache(userId: string): string | null {
  try {
    const raw = localStorage.getItem(CID_LOCAL_KEY)
    if (!raw) return null
    const { cid, uid, ts } = JSON.parse(raw) as CidCachePayload
    if (uid === userId && cid && Date.now() - ts < CID_LOCAL_TTL) return cid
  } catch {}
  return null
}

function writeCidCache(userId: string, cid: string) {
  const payload = JSON.stringify({ cid, uid: userId, ts: Date.now() } satisfies CidCachePayload)
  try {
    sessionStorage.setItem(CID_CACHE_KEY, payload)
  } catch {}
  try {
    localStorage.setItem(CID_LOCAL_KEY, payload)
  } catch {}
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Resolve the signed-in user for tenant scoping.
 * Prefer local session on resume: getUser() is a network call and often flakes
 * when a mobile PWA/Safari tab wakes up, even though Wi‑Fi is fine.
 */
async function resolveBrowserAuthUser(): Promise<{ id: string }> {
  const firstUserRes = await supabase.auth.getUser()
  let user = firstUserRes.data.user

  if (!user) {
    const { data: sessionData } = await supabase.auth.getSession()
    if (sessionData.session?.user) {
      user = sessionData.session.user
      // Best-effort revalidate; ignore network errors if local session exists.
      try {
        const secondUserRes = await supabase.auth.getUser()
        if (secondUserRes.data.user) user = secondUserRes.data.user
      } catch {
        /* keep session user */
      }
    }
  }

  // Mobile resume: auth storage can settle a few hundred ms after visibility.
  for (let attempt = 0; !user && attempt < 3; attempt++) {
    await sleep(200 * (attempt + 1))
    const { data: sessionData } = await supabase.auth.getSession()
    if (sessionData.session?.user) {
      user = sessionData.session.user
      break
    }
  }

  if (!user) {
    throw new Error('נדרשת התחברות')
  }

  return user
}

export async function resolveBamakorClientIdForBrowser(): Promise<string> {
  const user = await resolveBrowserAuthUser()

  const cached = readCidCache(user.id) || readCidLocalCache(user.id)
  if (cached) {
    // Refresh session cache so subsequent navigations stay hot.
    writeCidCache(user.id, cached)
    return cached
  }

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
