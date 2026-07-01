import type { SupabaseClient } from '@supabase/supabase-js'
import { getLogger } from '@/lib/logging'

/**
 * מונה מפוזר באמצעות `public.api_rate_limits` + RPC `bamakor_rate_limit`.
 */
export type RpcRateLimitResult =
  | { isLimited: boolean; remaining?: number; resetMs?: number; rpcFailed?: false }
  | { rpcFailed: true; isLimited: false }

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
    getLogger().warn('RATE_LIMIT', 'bamakor_rate_limit RPC failed — allowing request', {
      message: error.message,
      code: error.code,
    })
    return { rpcFailed: true, isLimited: false }
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
  if ('rpcFailed' in r && r.rpcFailed) return { isLimited: false }
  return { isLimited: r.isLimited, remaining: r.remaining }
}

/** POST מהדפדפן עם משתמש מחובר — 20/דקה לכל משתמש+נתיב. */
export async function checkAuthenticatedPostRouteLimit(admin: SupabaseClient, userId: string, routeSlug: string) {
  const safeUser = userId.slice(0, 64)
  const safeSlug = routeSlug.slice(0, 80).replace(/[^a-zA-Z0-9:_-]/g, '_')
  const r = await checkRateLimit(admin, `post:user:${safeUser}:${safeSlug}`, 20, 60_000)
  if ('rpcFailed' in r && r.rpcFailed) return { isLimited: false }
  return r
}

/** GET מהדפדפן (קריאות לקריאה בלבד) — 120/דקה לכל משתמש+נתיב. */
export async function checkAuthenticatedReadRouteLimit(admin: SupabaseClient, userId: string, routeSlug: string) {
  const safeUser = userId.slice(0, 64)
  const safeSlug = routeSlug.slice(0, 80).replace(/[^a-zA-Z0-9:_-]/g, '_')
  const r = await checkRateLimit(admin, `get:user:${safeUser}:${safeSlug}`, 120, 60_000)
  if ('rpcFailed' in r && r.rpcFailed) return { isLimited: false }
  return r
}

/** POST ללא משתמש (דיווח ציבורי, worker token וכד') — 20/דקה לכל IP + נתיב. */
export async function checkIpPostRouteLimit(admin: SupabaseClient, ip: string, routeSlug: string) {
  const safeIp = (ip || 'unknown').slice(0, 64)
  const safeSlug = routeSlug.slice(0, 80).replace(/[^a-zA-Z0-9:_-]/g, '_')
  const r = await checkRateLimit(admin, `post:ip:${safeIp}:${safeSlug}`, 20, 60_000)
  if ('rpcFailed' in r && r.rpcFailed) return { isLimited: false }
  return r
}
