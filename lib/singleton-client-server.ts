import type { SupabaseClient } from '@supabase/supabase-js'
import { requireClientIdForUser } from '@/lib/tenant-resolution'
import { createProcessMemoryCache } from '@/lib/process-memory-cache'

const CLIENT_ID_TTL_MS = 60_000

const clientIdByUserCache = createProcessMemoryCache<string>(CLIENT_ID_TTL_MS)

/**
 * מחזיר את `clients.id` של המשתמש המחובר (דרך organization → client).
 * `userId` חובה — מזהה מ־`getUser()` ב-route.
 *
 * Short-lived in-process cache (60s) dedupes org-chain lookups when the same
 * serverless instance handles multiple /api requests in a burst (e.g. tasks N+1).
 *
 * Fallback: ב-development בלבד — `BAMAKOR_CLIENT_ID` אם אין שיוך ארגון (ראו `requireClientIdForUser`).
 */
export async function getSingletonClientId(
  admin: SupabaseClient,
  userId: string
): Promise<string> {
  const cached = clientIdByUserCache.get(userId)
  if (cached) return cached

  const clientId = await requireClientIdForUser(admin, userId)
  clientIdByUserCache.set(userId, clientId)
  return clientId
}

/** Test / sign-out hook — drop cached tenant ids for this process. */
export function clearSingletonClientIdCache(): void {
  clientIdByUserCache.clear()
}
