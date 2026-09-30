/**
 * Short-lived httpOnly cookie caching tenant resolution for middleware.
 * Avoids organization_users → organizations → clients.enabled_nav_features on every nav.
 * Still requires auth.getUser() — only skips the DB org chain.
 *
 * Audit #08: payload is HMAC-signed; unsigned / forged cookies are rejected.
 */

import { createHmac, timingSafeEqual } from 'crypto'
import type { NextRequest, NextResponse } from 'next/server'
import type { SidebarNavItemId } from '@/lib/sidebar-nav'

export const MIDDLEWARE_TENANT_COOKIE = 'bino_mw_tenant_v2'
export const MIDDLEWARE_TENANT_TTL_SEC = 5 * 60

export type MiddlewareTenantCachePayload = {
  uid: string
  clientId: string
  /** null = legacy unlimited (all features). */
  enabledNavFeatures: SidebarNavItemId[] | null
  /** unix ms when written */
  ts: number
}

function signingSecret(): string | null {
  const dedicated = (process.env.MIDDLEWARE_TENANT_COOKIE_SECRET || '').trim()
  if (dedicated) return dedicated
  const fallback = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  return fallback || null
}

function encodeBody(payload: MiddlewareTenantCachePayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

function signBody(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

function decodePayload(raw: string, secret: string): MiddlewareTenantCachePayload | null {
  try {
    const sep = raw.lastIndexOf('.')
    if (sep <= 0) return null
    const body = raw.slice(0, sep)
    const sig = raw.slice(sep + 1)
    if (!body || !sig) return null
    const expected = signBody(body, secret)
    if (!safeEqual(sig, expected)) return null

    const json = Buffer.from(body, 'base64url').toString('utf8')
    const parsed = JSON.parse(json) as MiddlewareTenantCachePayload
    if (
      !parsed ||
      typeof parsed.uid !== 'string' ||
      typeof parsed.clientId !== 'string' ||
      typeof parsed.ts !== 'number'
    ) {
      return null
    }
    if (parsed.enabledNavFeatures != null && !Array.isArray(parsed.enabledNavFeatures)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function readMiddlewareTenantCache(
  req: NextRequest,
  userId: string
): MiddlewareTenantCachePayload | null {
  const secret = signingSecret()
  if (!secret) return null

  const raw = req.cookies.get(MIDDLEWARE_TENANT_COOKIE)?.value
  if (!raw) return null
  const parsed = decodePayload(raw, secret)
  if (!parsed) return null
  if (parsed.uid !== userId) return null
  // Reject future timestamps (forged far-future ts would never expire).
  if (parsed.ts > Date.now() + 60_000) return null
  if (Date.now() - parsed.ts >= MIDDLEWARE_TENANT_TTL_SEC * 1000) return null
  if (!parsed.clientId.trim()) return null
  return parsed
}

export function writeMiddlewareTenantCache(
  response: NextResponse,
  payload: Omit<MiddlewareTenantCachePayload, 'ts'>
): void {
  const secret = signingSecret()
  if (!secret) return

  const full: MiddlewareTenantCachePayload = { ...payload, ts: Date.now() }
  const body = encodeBody(full)
  const value = `${body}.${signBody(body, secret)}`
  response.cookies.set(MIDDLEWARE_TENANT_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MIDDLEWARE_TENANT_TTL_SEC,
  })
}

export function clearMiddlewareTenantCache(response: NextResponse): void {
  response.cookies.set(MIDDLEWARE_TENANT_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  // Also clear legacy unsigned cookie name if present.
  response.cookies.set('bino_mw_tenant_v1', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}
