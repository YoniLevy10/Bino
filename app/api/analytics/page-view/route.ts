import { NextResponse } from 'next/server'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { pageViewBodySchema } from '@/lib/api-body-schemas'
import { navIdFromPathname } from '@/lib/nav-from-pathname'

export async function POST(req: Request) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const limited = await checkAuthenticatedPostRouteLimit(auth.ctx.admin, auth.ctx.userId, 'analytics-page-view')
  if (limited.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף לא תקין' }, { status: 400 })
  }

  const parsed = pageViewBodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 })
  }

  const path = parsed.data.path.startsWith('/') ? parsed.data.path.slice(0, 200) : `/${parsed.data.path.slice(0, 199)}`
  const navId = (parsed.data.nav_id?.trim() || navIdFromPathname(path) || '').slice(0, 80)
  if (!navId) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const { error } = await auth.ctx.admin.from('feature_page_views').insert({
    client_id: auth.ctx.clientId,
    user_id: auth.ctx.userId,
    nav_id: navId,
    path,
  })

  // Table may not exist until migration is applied — fail soft.
  if (error) {
    if (error.message?.includes('feature_page_views') || error.code === '42P01') {
      return NextResponse.json({ ok: true, skipped: true, reason: 'table_missing' })
    }
    console.warn('[page-view]', error.message)
    return NextResponse.json({ ok: true, skipped: true })
  }

  return NextResponse.json({ ok: true })
}
