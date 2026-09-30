import type { SupabaseClient } from '@supabase/supabase-js'
import { getLogger } from '@/lib/logging'

/**
 * מונה מפוזר באמצעות `public.api_rate_limits` + RPC `bamakor_rate_limit`.
 *
 * Authenticated dashboard traffic uses an in-process bucket first and only
 * sparsely syncs to Postgres. Every API call used to UPSERT `api_rate_limits`,
 * which dominated Disk IO / WAL on Micro compute (see Disk IO Budget alert).
 * Public / webhook / IP limits stay fully distributed (DB on every check).
 */
export type RpcRateLimitResult =
  | { isLimited: boolean; remaining?: number; resetMs?: number; rpcFailed?: false }
  | { rpcFailed: true; isLimited: true }

type LocalBucket = {
  count: number
  windowStartMs: number
  lastDbSyncCount: number
}

/** Process-local counters (best-effort across Vercel isolates). */
const localBuckets = new Map<string, LocalBucket>()

/** Sync authenticated counters to Postgres every N local hits (and near the limit). */
export const AUTH_RATE_LIMIT_DB_SYNC_EVERY = 8

const MAX_LOCAL_BUCKETS = 5_000

function pruneLocalBuckets(now: number, windowMs: number) {
  if (localBuckets.size < MAX_LOCAL_BUCKETS) return
  for (const [k, b] of localBuckets) {
    if (now - b.windowStartMs >= windowMs * 2) localBuckets.delete(k)
  }
  if (localBuckets.size < MAX_LOCAL_BUCKETS) return
  // Drop oldest half if still over cap.
  const entries = [...localBuckets.entries()].sort((a, b) => a[1].windowStartMs - b[1].windowStartMs)
  for (let i = 0; i < Math.ceil(entries.length / 2); i++) {
    localBuckets.delete(entries[i]![0])
  }
}

function bumpLocalBucket(key: string, windowMs: number): LocalBucket {
  const now = Date.now()
  pruneLocalBuckets(now, windowMs)
  let bucket = localBuckets.get(key)
  if (!bucket || now - bucket.windowStartMs >= windowMs) {
    bucket = { count: 0, windowStartMs: now, lastDbSyncCount: 0 }
    localBuckets.set(key, bucket)
  }
  bucket.count += 1
  return bucket
}

/** Test helper — clears in-process buckets between cases. */
export function __resetRateLimitLocalBucketsForTests() {
  localBuckets.clear()
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
    // Audit #50: fail closed — do not allow public/payment traffic when limiter is down.
    getLogger().warn('RATE_LIMIT', 'bamakor_rate_limit RPC failed — denying request', {
      message: error.message,
      code: error.code,
    })
    return { rpcFailed: true, isLimited: true }
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

/**
 * Authenticated traffic: memory-first, sparse DB sync.
 * Cuts most `api_rate_limits` UPSERTs (WAL / Disk IO) while still enforcing a
 * per-isolate limit and periodically publishing to the distributed counter.
 */
export async function checkAuthenticatedRateLimitSparse(
  supabaseAdmin: SupabaseClient,
  identifier: string,
  limit: number,
  windowMs: number,
  opts: { failOpenOnRpcError: boolean; dbSyncEvery?: number }
): Promise<RpcRateLimitResult> {
  const key = identifier.slice(0, 480)
  const syncEvery = Math.max(1, opts.dbSyncEvery ?? AUTH_RATE_LIMIT_DB_SYNC_EVERY)
  const bucket = bumpLocalBucket(key, windowMs)
  const resetMs = bucket.windowStartMs + windowMs

  if (bucket.count > limit) {
    return { isLimited: true, remaining: 0, resetMs }
  }

  const nearLimit = bucket.count >= Math.ceil(limit * 0.8)
  const shouldSyncDb =
    bucket.count === 1 ||
    bucket.count - bucket.lastDbSyncCount >= syncEvery ||
    nearLimit

  if (!shouldSyncDb) {
    return {
      isLimited: false,
      remaining: Math.max(limit - bucket.count, 0),
      resetMs,
    }
  }

  const r = await checkRateLimit(supabaseAdmin, key, limit, windowMs)
  bucket.lastDbSyncCount = bucket.count

  if ('rpcFailed' in r && r.rpcFailed) {
    if (opts.failOpenOnRpcError) {
      return { isLimited: false, remaining: Math.max(limit - bucket.count, 0), resetMs }
    }
    return r
  }

  if (r.isLimited) {
    return { isLimited: true, remaining: 0, resetMs: r.resetMs ?? resetMs }
  }

  const localRemaining = Math.max(limit - bucket.count, 0)
  const remaining =
    typeof r.remaining === 'number' ? Math.min(r.remaining, localRemaining) : localRemaining
  return {
    isLimited: false,
    remaining,
    resetMs: r.resetMs ?? resetMs,
  }
}

/** In-process only — for low-risk telemetry beacons (no Postgres UPSERT). */
export function checkRateLimitMemoryOnly(
  identifier: string,
  limit: number,
  windowMs: number
): { isLimited: boolean; remaining: number; resetMs: number } {
  const key = identifier.slice(0, 480)
  const bucket = bumpLocalBucket(key, windowMs)
  const resetMs = bucket.windowStartMs + windowMs
  if (bucket.count > limit) {
    return { isLimited: true, remaining: 0, resetMs }
  }
  return { isLimited: false, remaining: Math.max(limit - bucket.count, 0), resetMs }
}

/** Webhook WhatsApp: לפי מזהה מספר טלפון בענן של Meta — 100/דקה. */
export async function checkWhatsAppWebhookPhoneRateLimit(admin: SupabaseClient, phoneNumberId: string) {
  const id = phoneNumberId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'unknown'
  const r = await checkRateLimit(admin, `whatsapp:pn:${id}`, 100, 60_000)
  if ('rpcFailed' in r && r.rpcFailed) return { isLimited: true }
  return { isLimited: r.isLimited, remaining: r.remaining }
}

/** POST מהדפדפן עם משתמש מחובר — 20/דקה לכל משתמש+נתיב. */
export async function checkAuthenticatedPostRouteLimit(admin: SupabaseClient, userId: string, routeSlug: string) {
  const safeUser = userId.slice(0, 64)
  const safeSlug = routeSlug.slice(0, 80).replace(/[^a-zA-Z0-9:_-]/g, '_')
  const r = await checkAuthenticatedRateLimitSparse(
    admin,
    `post:user:${safeUser}:${safeSlug}`,
    20,
    60_000,
    { failOpenOnRpcError: false }
  )
  if ('rpcFailed' in r && r.rpcFailed) return { isLimited: true }
  return r
}

/** GET מהדפדפן (קריאות לקריאה בלבד) — 120/דקה לכל משתמש+נתיב. */
export async function checkAuthenticatedReadRouteLimit(admin: SupabaseClient, userId: string, routeSlug: string) {
  const safeUser = userId.slice(0, 64)
  const safeSlug = routeSlug.slice(0, 80).replace(/[^a-zA-Z0-9:_-]/g, '_')
  // Fail-open on dashboard GETs: limiter outage must not blank every screen (429 flood).
  // POST / public / webhook paths stay fail-closed in their own helpers.
  return checkAuthenticatedRateLimitSparse(
    admin,
    `get:user:${safeUser}:${safeSlug}`,
    120,
    60_000,
    { failOpenOnRpcError: true }
  )
}

/** POST ללא משתמש (דיווח ציבורי, worker token וכד') — 20/דקה לכל IP + נתיב. */
export async function checkIpPostRouteLimit(admin: SupabaseClient, ip: string, routeSlug: string) {
  const safeIp = (ip || 'unknown').slice(0, 64)
  const safeSlug = routeSlug.slice(0, 80).replace(/[^a-zA-Z0-9:_-]/g, '_')
  const r = await checkRateLimit(admin, `post:ip:${safeIp}:${safeSlug}`, 20, 60_000)
  if ('rpcFailed' in r && r.rpcFailed) return { isLimited: true }
  return r
}
