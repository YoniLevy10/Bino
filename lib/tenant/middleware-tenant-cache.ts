/**
 * Short-lived httpOnly cookie caching tenant resolution for middleware.
 * Avoids organization_users → organizations → clients.enabled_nav_features on every nav.
 * Still requires auth.getUser() — only skips the DB org chain.
 *
 * Audit #08: payload is HMAC-signed; unsigned / forged cookies are rejected.
 *
 * IMPORTANT: This module runs in the Edge middleware runtime. Use only Web APIs
 * (crypto.subtle / TextEncoder / btoa) — never Node `crypto` or `Buffer`.
 */

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

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  const pad = '='.repeat((4 - (value.length % 4)) % 4)
  const b64 = (value + pad).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function encodeBody(payload: MiddlewareTenantCachePayload): string {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)))
}

function decodeBody(body: string): string {
  return new TextDecoder().decode(base64UrlToBytes(body))
}

async function signBody(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return bytesToBase64Url(new Uint8Array(sig))
}

/** Constant-time string compare (Edge-safe; no Node crypto). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return out === 0
}

async function decodePayload(
  raw: string,
  secret: string
): Promise<MiddlewareTenantCachePayload | null> {
  try {
    const sep = raw.lastIndexOf('.')
    if (sep <= 0) return null
    const body = raw.slice(0, sep)
    const sig = raw.slice(sep + 1)
    if (!body || !sig) return null
    const expected = await signBody(body, secret)
    if (!safeEqual(sig, expected)) return null

    const json = decodeBody(body)
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

export async function readMiddlewareTenantCache(
  req: NextRequest,
  userId: string
): Promise<MiddlewareTenantCachePayload | null> {
  const secret = signingSecret()
  if (!secret) return null

  const raw = req.cookies.get(MIDDLEWARE_TENANT_COOKIE)?.value
  if (!raw) return null
  const parsed = await decodePayload(raw, secret)
  if (!parsed) return null
  if (parsed.uid !== userId) return null
  // Reject future timestamps (forged far-future ts would never expire).
  if (parsed.ts > Date.now() + 60_000) return null
  if (Date.now() - parsed.ts >= MIDDLEWARE_TENANT_TTL_SEC * 1000) return null
  if (!parsed.clientId.trim()) return null
  return parsed
}

export async function writeMiddlewareTenantCache(
  response: NextResponse,
  payload: Omit<MiddlewareTenantCachePayload, 'ts'>
): Promise<void> {
  const secret = signingSecret()
  if (!secret) return

  const full: MiddlewareTenantCachePayload = { ...payload, ts: Date.now() }
  const body = encodeBody(full)
  const value = `${body}.${await signBody(body, secret)}`
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
