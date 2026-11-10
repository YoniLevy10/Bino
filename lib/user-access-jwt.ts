import {
  shouldSignOutForTenantGate,
  type TenantGateKind,
} from '@/lib/middleware-tenant-gate'

/**
 * Supabase user access tokens are JWTs (three base64url segments).
 * Cron secrets and other opaque bearer tokens are not, and must not be treated as a user session.
 */
const USER_JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

export function extractUserAccessJwt(authorization: string | null | undefined): string | null {
  if (!authorization) return null
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorization.trim())
  if (!match) return null
  const token = match[1]
  if (!token || !USER_JWT.test(token)) return null
  return token
}

/**
 * Cookie sessions win. A user JWT is consulted only when the request has no cookie user
 * and the route is allowed to accept mobile bearer auth.
 */
export function bearerFallbackJwt(input: {
  cookieUserPresent: boolean
  authorization: string | null | undefined
  allowBearer: boolean
}): string | null {
  if (input.cookieUserPresent || !input.allowBearer) return null
  return extractUserAccessJwt(input.authorization)
}

/**
 * Bearer-only mobile sessions have no browser cookies to clear.
 * Signing out here must not run — a bad or org-less token is rejected with 401/403 only.
 */
export function shouldSignOutResolvedSession(kind: TenantGateKind, viaBearer: boolean): boolean {
  if (viaBearer) return false
  return shouldSignOutForTenantGate(kind)
}
