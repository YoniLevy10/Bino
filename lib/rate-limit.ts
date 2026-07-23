import type { SupabaseClient } from '@supabase/supabase-js'
import { getLogger } from '@/lib/logging'

/**
 * מונה מפוזר באמצעות `public.api_rate_limits` + RPC `bamakor_rate_limit`.
 * אם ה-RPC נכשל — נופלים למגבלה מקומית בזיכרון (לא fail-open).
 */
export type RpcRateLimitResult =
  | { isLimited: boolean; remaining?: number; resetMs?: number; rpcFailed?: false }
  | { rpcFailed: true; isLimited: boolean; remaining?: number; resetMs?: number }

type MemoryBucket = { count: number; resetAt: number }

const memoryBuckets = new Map<string, MemoryBucket>()
const MEMORY_MAX_KEYS = 5_000

function pruneMemoryBuckets(now: number): void {
  if (memoryBuckets.size < MEMORY_MAX_KEYS) return
  for (const [k, v] of memoryBuckets) {
    if (v.resetAt <= now) memoryBuckets.delete(k)
  }
  if (memoryBuckets.size < MEMORY_MAX_KEYS) return
  // Drop oldest ~20% if still full
  const entries = Array.from(memoryBuckets.entries()).sort((a, b) => a[1].resetAt - b[1].resetAt)
  const drop = Math.ceil(entries.length * 0.2)
  for (let i = 0; i < drop; i++) {
    memoryBuckets.delete(entries[i][0])
  }
}

function checkMemoryRateLimit(
  identifier: string,
  limit: number,
  windowMs: number
): { isLimited: boolean; remaining: number; resetMs: number } {
  const now = Date.now()
  pruneMemoryBuckets(now)
  const key = identifier.slice(0, 480)
  const existing = memoryBuckets.get(key)
  if (!existing || existing.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs })
    return { isLimited: false, remaining: Math.max(0, limit - 1), resetMs: now + windowMs }
  }
  existing.count += 1
  const isLimited = existing.count > limit
  return {
    isLimited,
    remaining: Math.max(0, limit - existing.count),
    resetMs: existing.resetAt,
  }
}

export async function checkRateLimit(
  supabaseAdmin: SupabaseClient,
  identifier: string,
  limit: number,
  windowMs: number
): Promise<RpcRateLimitResult> {
  const key = identifier.slice(0, 480)
  const { data, error } = await supabaseAdmin.rpc('bamakor_rate_limit', {
    p_key: key,
    p_window_ms: windowMs,
    p_max: limit,
  })

  if (error) {
    getLogger().warn('RATE_LIMIT', 'bamakor_rate_limit RPC failed — using in-memory fallback', {
      message: error.message,
      code: error.code,
    })
    const mem = checkMemoryRateLimit(identifier, limit, windowMs)
    return { rpcFailed: true, isLimited: mem.isLimited, remaining: mem.remaining, resetMs: mem.resetMs }
  }

  const row = Array.isArray(data) ? data[0] : data
  const isLimited = !!row?.is_limited
  const remaining = typeof row?.remaining === 'number' ? (row.remaining as number) : undefined
  const resetAt = row?.reset_at ? new Date(row.reset_at as string).getTime() : undefined
  return {
    isLimited,
    remaining,
    resetMs: resetAt,
  }
}

/** Webhook WhatsApp: לפי מזהה מספר טלפון בענן של Meta — 100/דקה. */
export async function checkWhatsAppWebhookPhoneRateLimit(admin: SupabaseClient, phoneNumberId: string) {
  const id = phoneNumberId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'unknown'
  const r = await checkRateLimit(admin, `whatsapp:pn:${id}`, 100, 60_000)
  return { isLimited: r.isLimited, remaining: r.remaining }
}

/** POST מהדפדפן עם משתמש מחובר — 20/דקה לכל משתמש+נתיב. */
export async function checkAuthenticatedPostRouteLimit(admin: SupabaseClient, userId: string, routeSlug: string) {
  const safeUser = userId.slice(0, 64)
  const safeSlug = routeSlug.slice(0, 80).replace(/[^a-zA-Z0-9:_-]/g, '_')
  return checkRateLimit(admin, `post:user:${safeUser}:${safeSlug}`, 20, 60_000)
}

/** GET מהדפדפן (קריאות לקריאה בלבד) — 120/דקה לכל משתמש+נתיב. */
export async function checkAuthenticatedReadRouteLimit(admin: SupabaseClient, userId: string, routeSlug: string) {
  const safeUser = userId.slice(0, 64)
  const safeSlug = routeSlug.slice(0, 80).replace(/[^a-zA-Z0-9:_-]/g, '_')
  return checkRateLimit(admin, `get:user:${safeUser}:${safeSlug}`, 120, 60_000)
}

/** POST ללא משתמש (דיווח ציבורי, worker token וכד') — 20/דקה לכל IP + נתיב. */
export async function checkIpPostRouteLimit(admin: SupabaseClient, ip: string, routeSlug: string) {
  const safeIp = (ip || 'unknown').slice(0, 64)
  const safeSlug = routeSlug.slice(0, 80).replace(/[^a-zA-Z0-9:_-]/g, '_')
  return checkRateLimit(admin, `post:ip:${safeIp}:${safeSlug}`, 20, 60_000)
}

/** GET ציבורי (תחנת נוכחות וכד') — 60/דקה לכל IP + נתיב. */
export async function checkIpGetRouteLimit(admin: SupabaseClient, ip: string, routeSlug: string) {
  const safeIp = (ip || 'unknown').slice(0, 64)
  const safeSlug = routeSlug.slice(0, 80).replace(/[^a-zA-Z0-9:_-]/g, '_')
  return checkRateLimit(admin, `get:ip:${safeIp}:${safeSlug}`, 60, 60_000)
}
