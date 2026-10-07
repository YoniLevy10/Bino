import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { listClientIdsForUserId } from '@/lib/tenant-resolution'
import {
  fetchClientEnabledNavFeatures,
  isNavFeatureEnabled,
  navItemIdForPathname,
} from '@/lib/client-nav-features'
import { SUPABASE_AUTH_COOKIE_OPTIONS } from '@/lib/supabase-cookie-options'
import {
  clearMiddlewareTenantCache,
  readMiddlewareTenantCache,
  writeMiddlewareTenantCache,
} from '@/lib/middleware-tenant-cache'
import type { SidebarNavItemId } from '@/lib/sidebar-nav'
import { isResidentPortalApiPath, isResidentPortalPath } from '@/lib/is-resident-portal-path'
import { userHasActiveResidentMembership } from '@/lib/resident-portal/memberships'
import {
  buildCanonicalRedirectUrl,
  shouldRedirectVercelAppHostToCanonical,
} from '@/lib/canonical-host'
import { applyMiddlewareSupabaseCookies } from '@/lib/middleware-auth-cookies'

type Pending = { response: NextResponse }

function createMiddlewareSupabase(req: NextRequest, pending: Pending) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return null

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookieOptions: SUPABASE_AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll(cookiesToSet) {
        // Forward rotated tokens onto this request. Response-only Set-Cookie
        // leaves route-handler getUser() on the old refresh token → 401.
        applyMiddlewareSupabaseCookies(req, pending, cookiesToSet)
      },
    },
  })
}

/** Keep auth cookies that getUser() may have refreshed when swapping to a redirect. */
function redirectWithCookies(pending: Pending, url: URL) {
  const redirect = NextResponse.redirect(url)
  // Preserve full Set-Cookie (incl. Max-Age) — dropping options turns them into
  // session cookies that iOS standalone PWA wipes when the app is backgrounded.
  const setCookies =
    typeof pending.response.headers.getSetCookie === 'function'
      ? pending.response.headers.getSetCookie()
      : []
  for (const cookie of setCookies) {
    redirect.headers.append('Set-Cookie', cookie)
  }
  pending.response = redirect
  return redirect
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Production *.vercel.app → https://bino.casa (avoid Vercel SSO / stale aliases).
  // Keep webhooks/crons/well-known on the legacy alias (docs/DOMAIN.md).
  const host =
    req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() ||
    req.headers.get('host')?.trim() ||
    ''
  if (
    shouldRedirectVercelAppHostToCanonical({
      host,
      pathname,
      vercelEnv: process.env.VERCEL_ENV,
      nodeEnv: process.env.NODE_ENV,
    })
  ) {
    return NextResponse.redirect(
      buildCanonicalRedirectUrl({
        pathname,
        search: req.nextUrl.search,
      }),
      308
    )
  }

  // Temporary: marketing landing is down — bino.casa / and /en go to /login.
  // Logged-in managers (esp. iOS PWA with old start_url "/") → dashboard.
  // Resident-only accounts → /resident (never mix manager + resident authz).
  if (pathname === '/' || pathname === '/en') {
    const pending: Pending = { response: NextResponse.next() }
    const supabase = createMiddlewareSupabase(req, pending)
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        try {
          // Service role for tenant chain — authenticated JWT cannot filter
          // clients.is_active (078 column grant) and was returning 503 on login.
          const admin = getSupabaseAdmin()
          const clientIds = await listClientIdsForUserId(admin, user.id)
          if (clientIds.length === 1) {
            const url = req.nextUrl.clone()
            url.pathname = '/dashboard'
            return redirectWithCookies(pending, url)
          }
          if (clientIds.length === 0) {
            const hasResident = await userHasActiveResidentMembership(admin, user.id)
            if (hasResident) {
              const url = req.nextUrl.clone()
              url.pathname = '/resident'
              return redirectWithCookies(pending, url)
            }
          }
        } catch {
          // fall through to login redirect on transient errors
        }
      }
    }
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return redirectWithCookies(pending, url)
  }

  // Resident login / shared join link / UX sandbox are public. Other /resident* need session below.
  if (
    pathname === '/resident/login' ||
    pathname.startsWith('/resident/login/') ||
    pathname === '/resident/join' ||
    pathname.startsWith('/resident/join/') ||
    pathname === '/resident/sandbox' ||
    pathname.startsWith('/resident/sandbox/')
  ) {
    return NextResponse.next()
  }

  // Public routes: do not block WhatsApp webhook or login screen
  // Also: /api/superadmin/* and /api/admin/* enforce session+MFA in-handler; pages are public entry
  // Audit 01–03: public ticket create + provider webhooks must bypass session gate;
  // handlers still enforce their own auth (client_id / webhook secret / Bearer).
  if (
    pathname === '/savings-report' ||
    pathname.startsWith('/savings-report/') ||
    pathname.startsWith('/api/webhook/whatsapp') ||
    pathname.startsWith('/api/webhook/grow') ||
    pathname.startsWith('/api/webhook/document-sign') ||
    pathname === '/api/create-ticket' ||
    pathname.startsWith('/api/create-ticket/') ||
    pathname.startsWith('/api/public/') ||
    pathname.startsWith('/api/worker-auth') ||
    pathname.startsWith('/api/worker/') ||
    pathname.startsWith('/api/superadmin/') ||
    pathname.startsWith('/api/admin/') ||
    pathname === '/api/resident/auth/request-otp' ||
    pathname.startsWith('/api/resident/auth/request-otp/') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/api/cron/') ||
    pathname.startsWith('/report') ||
    pathname.startsWith('/intake') ||
    pathname.startsWith('/pay') ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/contact' ||
    pathname === '/en' ||
    pathname === '/guides' ||
    pathname.startsWith('/guides/') ||
    pathname === '/vaad-pay' ||
    pathname.startsWith('/vaad-pay/') ||
    pathname.startsWith('/admin/') ||
    pathname.startsWith('/superadmin') ||
    pathname === '/worker-login' ||
    pathname === '/worker' ||
    pathname.startsWith('/worker/') ||
    pathname.startsWith('/attendance/scan') ||
    pathname === '/offline.html' ||
    pathname.startsWith('/.well-known/')
  ) {
    return NextResponse.next()
  }

  // Resident portal: require Auth session, but DO NOT require organization_users.
  // APIs enforce active membership via requireResidentContext (service_role checks).
  if (isResidentPortalPath(pathname) || isResidentPortalApiPath(pathname)) {
    const pending: Pending = { response: NextResponse.next() }
    const supabase = createMiddlewareSupabase(req, pending)
    if (!supabase) {
      return pending.response
    }
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      if (isResidentPortalApiPath(pathname)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const url = req.nextUrl.clone()
      url.pathname = '/resident/login'
      url.searchParams.set('redirectTo', pathname)
      return redirectWithCookies(pending, url)
    }
    return pending.response
  }

  // Let Next handle static assets + SEO crawl endpoints
  if (
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname === '/icon.png' ||
    pathname === '/apple-icon.png' ||
    pathname === '/manifest.json' ||
    pathname === '/manifest.worker.json' ||
    pathname === '/manifest.superadmin.json' ||
    pathname === '/sw.js' ||
    pathname === '/offline.html' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname.startsWith('/marketing/') ||
    pathname === '/opengraph-image' ||
    pathname.startsWith('/opengraph-image') ||
    pathname === '/twitter-image' ||
    pathname.startsWith('/twitter-image') ||
    pathname === '/llms.txt'
  ) {
    return NextResponse.next()
  }

  const pending: Pending = { response: NextResponse.next() }
  const supabase = createMiddlewareSupabase(req, pending)
  if (!supabase) {
    return pending.response
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    clearMiddlewareTenantCache(pending.response)
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', pathname)
    return redirectWithCookies(pending, url)
  }

  let clientId: string
  let enabledNavFeatures: SidebarNavItemId[] | null | undefined
  const cachedTenant = await readMiddlewareTenantCache(req, user.id)

  if (cachedTenant) {
    clientId = cachedTenant.clientId
    enabledNavFeatures = cachedTenant.enabledNavFeatures
  } else {
    try {
      // Service role: full clients/orgs read. Session JWT cannot use clients.is_active
      // (078 omit) — that caused CLIENTS_ACTIVE_QUERY_FAILED → 503 on every nav.
      // Cookie HMAC stays Web Crypto (Edge-safe); admin client is supabase-js only.
      const admin = getSupabaseAdmin()
      const clientIds = await listClientIdsForUserId(admin, user.id)
      if (clientIds.length === 0) {
        clearMiddlewareTenantCache(pending.response)
        await supabase.auth.signOut()
        if (pathname.startsWith('/api/')) {
          return NextResponse.json(
            { error: 'אין גישה — חשבון לא משויך לארגון' },
            { status: 403 }
          )
        }
        const url = req.nextUrl.clone()
        url.pathname = '/login'
        url.searchParams.set('error', 'no_access')
        return redirectWithCookies(pending, url)
      }
      if (clientIds.length > 1) {
        clearMiddlewareTenantCache(pending.response)
        await supabase.auth.signOut()
        if (pathname.startsWith('/api/')) {
          return NextResponse.json(
            { error: 'החשבון משויך ליותר מלקוח אחד — פנו לתמיכה' },
            { status: 403 }
          )
        }
        const url = req.nextUrl.clone()
        url.pathname = '/login'
        url.searchParams.set('error', 'multi_tenant')
        return redirectWithCookies(pending, url)
      }
      clientId = clientIds[0]

      // Prefetch nav features into the same cookie so gated paths skip a second clients read.
      try {
        enabledNavFeatures = await fetchClientEnabledNavFeatures(admin, clientId)
      } catch {
        enabledNavFeatures = undefined
      }

      await writeMiddlewareTenantCache(pending.response, {
        uid: user.id,
        clientId,
        enabledNavFeatures: enabledNavFeatures ?? null,
      })
    } catch (err) {
      // Transient DB / admin / network failure — NEVER signOut.
      // Signing out here was wiping iOS PWA sessions on resume flakes.
      console.error('[middleware] tenant resolution transient failure — keeping session', err)
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: 'שגיאת שרת זמנית — נסו שוב' },
          { status: 503 }
        )
      }
      // Allow the page through; client-side resolveBinoClientIdForBrowser has
      // localStorage cache + retries for mobile resume.
      return pending.response
    }
  }

  // Platform / marketing / diagnostic routes — not exposed to tenants (ops via superadmin + email).
  const blockedAuxPaths = [
    '/system-map',
    '/health',
    '/assistant',
    '/error-logs',
    '/failed-notifications',
    '/notifications/failed',
    '/api/health',
    '/api/assistant/query',
    '/api/notifications/failed',
    '/api/error-logs',
    '/api/failed-notifications',
  ] as const
  if (
    blockedAuxPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const url = req.nextUrl.clone()
    url.pathname = '/dashboard'
    return redirectWithCookies(pending, url)
  }

  const navFeatureId = navItemIdForPathname(pathname)
  if (navFeatureId) {
    try {
      let enabled = enabledNavFeatures
      if (enabled === undefined) {
        const admin = getSupabaseAdmin()
        enabled = await fetchClientEnabledNavFeatures(admin, clientId)
        await writeMiddlewareTenantCache(pending.response, {
          uid: user.id,
          clientId,
          enabledNavFeatures: enabled,
        })
      }
      if (!isNavFeatureEnabled(enabled, navFeatureId)) {
        const url = req.nextUrl.clone()
        url.pathname = '/addons'
        url.searchParams.set('blocked', '1')
        return redirectWithCookies(pending, url)
      }
    } catch {
      // should not happen — clientId already resolved; keep session
    }
  }

  return pending.response
}

export const config = {
  // Exclude static/SEO/PWA assets from Edge middleware invocation (no tenant/auth change).
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|manifest\\.json|manifest\\.worker\\.json|manifest\\.superadmin\\.json|sw\\.js|offline\\.html|robots\\.txt|sitemap\\.xml|llms\\.txt|marketing/|opengraph-image|twitter-image|\\.well-known/).*)',
  ],
}
