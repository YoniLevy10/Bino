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

function readCidCacheEntry(): CidCachePayload | null {
  try {
    const raw = sessionStorage.getItem(CID_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CidCachePayload
    if (parsed?.cid && parsed?.uid && typeof parsed.ts === 'number') return parsed
  } catch {}
  return null
}

function readCidLocalCacheEntry(): CidCachePayload | null {
  try {
    const raw = localStorage.getItem(CID_LOCAL_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CidCachePayload
    if (parsed?.cid && parsed?.uid && typeof parsed.ts === 'number') return parsed
  } catch {}
  return null
}

function readCidCache(userId: string): string | null {
  const entry = readCidCacheEntry()
  if (entry && entry.uid === userId && Date.now() - entry.ts < CID_CACHE_TTL) return entry.cid
  return null
}

function readCidLocalCache(userId: string): string | null {
  const entry = readCidLocalCacheEntry()
  if (entry && entry.uid === userId && Date.now() - entry.ts < CID_LOCAL_TTL) return entry.cid
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
 * Prefer local session when cid is already cached — getUser() is a network call.
 * Fall back to getUser + retries when there is no usable local session.
 */
async function resolveBrowserAuthUser(opts?: {
  preferLocalSession?: boolean
}): Promise<{ id: string }> {
  if (opts?.preferLocalSession) {
    const { data: sessionData } = await supabase.auth.getSession()
    if (sessionData.session?.user) {
      return sessionData.session.user
    }
  }

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

export async function resolveBinoClientIdForBrowser(): Promise<string> {
  // Fast path: if we already know uid+cid from storage, use local session only
  // (avoids getUser network on every provider/page resolve).
  const sessionEntry = readCidCacheEntry()
  const localEntry = readCidLocalCacheEntry()
  const hotEntry =
    sessionEntry && Date.now() - sessionEntry.ts < CID_CACHE_TTL
      ? sessionEntry
      : localEntry && Date.now() - localEntry.ts < CID_LOCAL_TTL
        ? localEntry
        : null

  if (hotEntry) {
    try {
      const user = await resolveBrowserAuthUser({ preferLocalSession: true })
      if (user.id === hotEntry.uid) {
        writeCidCache(user.id, hotEntry.cid)
        return hotEntry.cid
      }
    } catch {
      /* fall through to full resolve */
    }
  }

  const user = await resolveBrowserAuthUser()

  const cached = readCidCache(user.id) || readCidLocalCache(user.id)
  if (cached) {
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

/** @deprecated use resolveBinoClientIdForBrowser — BAMAKOR_CLIENT_ID env alias kept */
export const resolveBamakorClientIdForBrowser = resolveBinoClientIdForBrowser
