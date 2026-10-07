import { NextResponse, type NextRequest } from 'next/server'

type PendingResponse = { response: NextResponse }

type SupabaseCookieToSet = {
  name: string
  value: string
  options?: Parameters<NextResponse['cookies']['set']>[2]
}

function setCookieName(header: string): string {
  const eq = header.indexOf('=')
  return (eq === -1 ? header : header.slice(0, eq)).trim()
}

/**
 * `getUser()` in middleware may rotate the Supabase access token.
 * Route handlers read the *request* cookies, not `Set-Cookie` on the response.
 * If only the response is updated, the handler refreshes the same token again
 * and returns 401 «נדרשת התחברות».
 *
 * Copy the new tokens onto the request and rebuild `NextResponse.next({ request })`
 * so this request's API routes see the rotated session. Cookies already queued
 * on the previous response (tenant cache) are kept.
 */
export function applyMiddlewareSupabaseCookies(
  req: NextRequest,
  pending: PendingResponse,
  cookiesToSet: SupabaseCookieToSet[]
): void {
  const replaced = new Set(cookiesToSet.map((cookie) => cookie.name))

  for (const { name, value } of cookiesToSet) {
    if (!value) req.cookies.delete(name)
    else req.cookies.set(name, value)
  }

  const previous =
    typeof pending.response.headers.getSetCookie === 'function'
      ? pending.response.headers.getSetCookie()
      : []

  const next = NextResponse.next({ request: req })
  for (const { name, value, options } of cookiesToSet) {
    next.cookies.set(name, value, options)
  }
  // Append after cookies.set so a jar rewrite cannot drop unrelated cookies
  // that were already queued (for example the tenant-cache clear before signOut).
  for (const header of previous) {
    const name = setCookieName(header)
    if (!name || replaced.has(name)) continue
    next.headers.append('Set-Cookie', header)
  }
  pending.response = next
}
