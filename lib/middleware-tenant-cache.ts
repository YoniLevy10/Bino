/**
 * Short-lived httpOnly cookie caching tenant resolution for middleware.
 * Avoids organization_users → organizations → clients.enabled_nav_features on every nav.
 * Still requires auth.getUser() — only skips the DB org chain.
 */

import type { NextRequest, NextResponse } from 'next/server'
import type { SidebarNavItemId } from '@/lib/sidebar-nav'

export const MIDDLEWARE_TENANT_COOKIE = 'bino_mw_tenant_v1'
export const MIDDLEWARE_TENANT_TTL_SEC = 5 * 60

export type MiddlewareTenantCachePayload = {
  uid: string
  clientId: string
  /** null = legacy unlimited (all features). */
  enabledNavFeatures: SidebarNavItemId[] | null
  /** unix ms when written */
  ts: number
}

function encodePayload(payload: MiddlewareTenantCachePayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

function decodePayload(raw: string): MiddlewareTenantCachePayload | null {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8')
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
  const raw = req.cookies.get(MIDDLEWARE_TENANT_COOKIE)?.value
  if (!raw) return null
  const parsed = decodePayload(raw)
  if (!parsed) return null
  if (parsed.uid !== userId) return null
  if (Date.now() - parsed.ts >= MIDDLEWARE_TENANT_TTL_SEC * 1000) return null
  if (!parsed.clientId.trim()) return null
  return parsed
}

export function writeMiddlewareTenantCache(
  response: NextResponse,
  payload: Omit<MiddlewareTenantCachePayload, 'ts'>
): void {
  const full: MiddlewareTenantCachePayload = { ...payload, ts: Date.now() }
  response.cookies.set(MIDDLEWARE_TENANT_COOKIE, encodePayload(full), {
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
}
