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
        cookiesToSet.forEach(({ name, value, options }) => {
          pending.response.cookies.set(name, value, options)
        })
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

  // Marketing home is public, but logged-in managers (esp. iOS PWA with old
  // start_url "/") should land on the dashboard — not the sales page.
  if (pathname === '/') {
    const pending: Pending = { response: NextResponse.next() }
    const supabase = createMiddlewareSupabase(req, pending)
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        const url = req.nextUrl.clone()
        url.pathname = '/dashboard'
        return redirectWithCookies(pending, url)
      }
    }
    return pending.response
  }

  // Public routes: do not block WhatsApp webhook or login screen
  // Also: /api/superadmin/* and /api/admin/* use x-admin-secret auth, not Supabase cookies
  if (
    pathname === '/savings-report' ||
    pathname.startsWith('/savings-report/') ||
    pathname.startsWith('/api/webhook/whatsapp') ||
    pathname.startsWith('/api/webhook/grow') ||
    pathname.startsWith('/api/public/') ||
    pathname.startsWith('/api/worker-auth') ||
    pathname.startsWith('/api/worker/') ||
    pathname.startsWith('/api/superadmin/') ||
    pathname.startsWith('/api/admin/') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/api/cron/') ||
    pathname.startsWith('/report') ||
    pathname.startsWith('/intake') ||
    pathname.startsWith('/pay') ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/contact' ||
    pathname === '/vaad-pay' ||
    pathname.startsWith('/vaad-pay/') ||
    pathname.startsWith('/admin/') ||
    pathname.startsWith('/superadmin') ||
    pathname === '/worker-login' ||
    pathname === '/worker' ||
    pathname.startsWith('/worker/') ||
    pathname.startsWith('/attendance/scan') ||
    pathname === '/offline.html'
  ) {
    return NextResponse.next()
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
    pathname.startsWith('/opengraph-image')
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
  const cachedTenant = readMiddlewareTenantCache(req, user.id)

  if (cachedTenant) {
    clientId = cachedTenant.clientId
    enabledNavFeatures = cachedTenant.enabledNavFeatures
  } else {
    try {
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

      writeMiddlewareTenantCache(pending.response, {
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
        writeMiddlewareTenantCache(pending.response, {
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
