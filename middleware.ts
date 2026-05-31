import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Public routes: do not block WhatsApp webhook or login screen
  // Also: /api/superadmin/* and /api/admin/* use x-admin-secret auth, not Supabase cookies
  if (
    pathname.startsWith('/api/webhook/whatsapp') ||
    pathname.startsWith('/api/public/') ||
    pathname.startsWith('/api/worker-auth') ||
    pathname.startsWith('/api/worker/') ||
    pathname.startsWith('/api/superadmin/') ||
    pathname.startsWith('/api/admin/') ||
    pathname === '/api/health' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth/callback') ||
    pathname.startsWith('/api/cron/') ||
    pathname.startsWith('/report') ||
    pathname.startsWith('/admin/') ||
    pathname === '/worker-login' ||
    pathname === '/worker' ||
    pathname.startsWith('/worker/') ||
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
    pathname === '/sw.js' ||
    pathname === '/offline.html'
  ) {
    return NextResponse.next()
  }

  const res = NextResponse.next()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return res
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options)
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

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

