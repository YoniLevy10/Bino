import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { headers } from 'next/headers'
import { getPublicSiteUrlFromHeaders } from '@/lib/site-url'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { userHasTenantAccess } from '@/lib/tenant-access'
import { upsertGoogleCalendarConnection } from '@/lib/google-calendar'
import { getSingletonClientId } from '@/lib/singleton-client-server'
import { userHasActiveResidentMembership } from '@/lib/resident-portal/memberships'
import { isResidentPortalPath } from '@/lib/is-resident-portal-path'
import { SUPABASE_AUTH_COOKIE_OPTIONS } from '@/lib/supabase-cookie-options'

function sanitizeNext(raw: string | null): string {
  if (!raw) return '/dashboard'
  if (!raw.startsWith('/')) return '/dashboard'
  if (raw.startsWith('//')) return '/dashboard'
  if (raw === '/') return '/dashboard'
  return raw
}

function wantsGoogleCalendarConnect(nextPath: string): boolean {
  try {
    const u = new URL(nextPath, 'https://local.invalid')
    return u.searchParams.get('gcal') === '1' || u.searchParams.get('google_calendar') === '1'
  } catch {
    return nextPath.includes('gcal=1') || nextPath.includes('google_calendar=1')
  }
}

type CookieToSet = {
  name: string
  value: string
  options?: Parameters<NextResponse['cookies']['set']>[2]
}

/**
 * OAuth PKCE: Google returns here with ?code= — exchange for a session and redirect.
 *
 * Critical: session cookies from exchangeCodeForSession MUST be written onto the
 * same NextResponse.redirect we return. Using cookies() from next/headers and then
 * creating a fresh redirect can drop Set-Cookie → middleware sees no user → bounce
 * straight back to /login (password login still works).
 *
 * Redirect URLs: https://bino.casa/auth/callback (see docs/DOMAIN.md)
 */
export async function GET(request: NextRequest) {
  const hdrs = await headers()
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = sanitizeNext(url.searchParams.get('next'))
  const origin = getPublicSiteUrlFromHeaders(hdrs)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  /** Cookies collected during exchange / signOut — applied to the final redirect. */
  const pendingCookies: CookieToSet[] = []

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: SUPABASE_AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const c of cookiesToSet) {
          pendingCookies.push(c)
          // Keep request jar in sync for subsequent getUser() in this handler.
          try {
            request.cookies.set(c.name, c.value)
          } catch {
            /* RequestCookies.set may be restricted; pendingCookies is the source of truth */
          }
        }
      },
    },
  })

  function redirectWithSessionCookies(targetPath: string) {
    const redirect = NextResponse.redirect(`${origin}${targetPath}`)
    for (const { name, value, options } of pendingCookies) {
      redirect.cookies.set(name, value, options)
    }
    return redirect
  }

  const { data: exchangeData, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    console.error('[auth/callback] exchangeCodeForSession failed', error.message)
    return redirectWithSessionCookies('/login?error=auth')
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    await supabase.auth.signOut()
    return redirectWithSessionCookies('/login?error=auth')
  }

  try {
    const admin = getSupabaseAdmin()
    const wantsResident = isResidentPortalPath(next) || next.startsWith('/resident')
    const acceptingInvite =
      next.startsWith('/resident/accept-invite') || next.includes('/resident/accept-invite')
    const hasTenant = await userHasTenantAccess(admin, user.id)
    const hasResident =
      wantsResident || !hasTenant
        ? await userHasActiveResidentMembership(admin, user.id)
        : false

    // Managers stay on manager routes; residents on /resident*. Never mix scopes.
    if (wantsResident) {
      if (!hasResident && !acceptingInvite) {
        await supabase.auth.signOut()
        return redirectWithSessionCookies('/resident/login?error=no_access')
      }
      return redirectWithSessionCookies(next)
    }

    if (!hasTenant) {
      if (hasResident) {
        return redirectWithSessionCookies('/resident')
      }
      await supabase.auth.signOut()
      return redirectWithSessionCookies('/login?error=no_access')
    }

    if (wantsGoogleCalendarConnect(next)) {
      const session = exchangeData.session
      const refresh = session?.provider_refresh_token
      const access = session?.provider_token ?? null
      if (refresh) {
        try {
          const clientId = await getSingletonClientId(admin, user.id)
          await upsertGoogleCalendarConnection(admin, {
            clientId,
            userId: user.id,
            googleEmail: user.email ?? null,
            refreshToken: refresh,
            accessToken: access,
            expiresInSeconds: session?.expires_in ?? 3600,
          })
        } catch (e) {
          console.error('[auth/callback] google calendar save failed', e)
          return redirectWithSessionCookies('/calendar?gcal=error')
        }
      } else {
        console.warn('[auth/callback] gcal connect without provider_refresh_token')
        return redirectWithSessionCookies('/calendar?gcal=need_consent')
      }
      return redirectWithSessionCookies('/calendar?gcal=connected')
    }
  } catch (e) {
    console.error('[auth/callback] post-exchange failure', e)
    await supabase.auth.signOut()
    return redirectWithSessionCookies('/login?error=auth')
  }

  return redirectWithSessionCookies(next)
}
