import { NextResponse, type NextRequest } from 'next/server'
import { cookies, headers } from 'next/headers'
import { createClient } from '@/utils/supabase/server'
import { getPublicSiteUrlFromHeaders } from '@/lib/site-url'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { userHasTenantAccess } from '@/lib/tenant-access'
import { upsertGoogleCalendarConnection } from '@/lib/google-calendar'
import { getSingletonClientId } from '@/lib/singleton-client-server'
import { userHasActiveResidentMembership } from '@/lib/resident-portal/memberships'
import { isResidentPortalPath } from '@/lib/is-resident-portal-path'

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

/**
 * OAuth PKCE: Google מחזיר לכאן עם ?code= — מחליפים לסשן ומפנים ליעד הבטוח.
 * יש להוסיף ב-Supabase Dashboard → Authentication → URL configuration:
 * Redirect URLs: https://bino.casa/auth/callback (ראה docs/DOMAIN.md)
 *
 * When next includes ?gcal=1, persist Google Calendar provider tokens for the tenant.
 */
export async function GET(request: NextRequest) {
  const hdrs = await headers()
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = sanitizeNext(url.searchParams.get('next'))
  const origin = getPublicSiteUrlFromHeaders(hdrs)

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data: exchangeData, error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=auth`)
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
      // Invite acceptance must run after login — membership does not exist yet.
      if (!hasResident && !acceptingInvite) {
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/resident/login?error=no_access`)
      }
      // Resident path: allow even if user also has tenant (area chosen by next URL).
      return NextResponse.redirect(`${origin}${next}`)
    }

    if (!hasTenant) {
      if (hasResident) {
        return NextResponse.redirect(`${origin}/resident`)
      }
      await supabase.auth.signOut()
      return NextResponse.redirect(`${origin}/login?error=no_access`)
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
          return NextResponse.redirect(`${origin}/calendar?gcal=error`)
        }
      } else {
        // Consent may have returned access without refresh (already granted before).
        // Client page can retry with prompt=consent.
        console.warn('[auth/callback] gcal connect without provider_refresh_token')
        return NextResponse.redirect(`${origin}/calendar?gcal=need_consent`)
      }
      return NextResponse.redirect(`${origin}/calendar?gcal=connected`)
    }
  } catch {
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?error=auth`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
