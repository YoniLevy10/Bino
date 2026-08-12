import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { listClientIdsForUserId } from '@/lib/tenant-resolution'
import {
  fetchClientEnabledNavFeatures,
  isNavFeatureEnabled,
  navItemIdForPathname,
} from '@/lib/client-nav-features'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Public routes: do not block WhatsApp webhook or login screen
  // Also: /api/superadmin/* and /api/admin/* use x-admin-secret auth, not Supabase cookies
  if (
    pathname.startsWith('/api/webhook/whatsapp') ||
    pathname.startsWith('/api/webhook/greeninvoice') ||
    pathname.startsWith('/api/integrations/fixly/webhook') ||
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

  // Let Next handle static assets
  if (
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname === '/icon.png' ||
    pathname === '/apple-icon.png' ||
    pathname === '/manifest.json' ||
    pathname === '/manifest.worker.json' ||
    pathname === '/manifest.superadmin.json' ||
    pathname === '/sw.js' ||
    pathname === '/offline.html'
  ) {
    return NextResponse.next()
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next()
  }

  let pendingResponse = NextResponse.next()

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          pendingResponse.cookies.set(name, value, options)
        })
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(url)
  }

  let clientId: string
  try {
    const admin = getSupabaseAdmin()
    const clientIds = await listClientIdsForUserId(admin, user.id)
    if (clientIds.length === 0) {
      throw new Error('NO_CLIENT')
    }
    if (clientIds.length > 1) {
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
      pendingResponse = NextResponse.redirect(url)
      return pendingResponse
    }
    clientId = clientIds[0]
  } catch {
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
    pendingResponse = NextResponse.redirect(url)
    return pendingResponse
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
    url.pathname = '/'
    pendingResponse = NextResponse.redirect(url)
    return pendingResponse
  }

  const navFeatureId = navItemIdForPathname(pathname)
  if (navFeatureId) {
    try {
      const admin = getSupabaseAdmin()
      const enabled = await fetchClientEnabledNavFeatures(admin, clientId)
      if (!isNavFeatureEnabled(enabled, navFeatureId)) {
        const url = req.nextUrl.clone()
        url.pathname = '/addons'
        url.searchParams.set('blocked', '1')
        pendingResponse = NextResponse.redirect(url)
        return pendingResponse
      }
    } catch {
      // should not happen — clientId already resolved
    }
  }

  return pendingResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
