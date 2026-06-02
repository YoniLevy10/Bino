import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientIdWithNavFeature } from '@/lib/api-nav-guard'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { createCalendarEventBodySchema } from '@/lib/api-body-schemas'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSessionClientIdWithNavFeature('calendar')
    if (!auth.ok) return auth.response

    const from = req.nextUrl.searchParams.get('from')
    const to = req.nextUrl.searchParams.get('to')
    if (!from || !to) {
      return NextResponse.json({ error: 'נדרשים from ו-to (ISO)' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from('calendar_events')
      .select(
        'id, title, description, location, starts_at, ends_at, all_day, project_id, event_type, projects(name)'
      )
      .eq('client_id', auth.ctx.clientId)
      .lt('starts_at', to)
      .gt('ends_at', from)
      .order('starts_at', { ascending: true })

    if (error) {
      console.error('[calendar/events GET]', error.message)
      return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
    }

    const events = (data || []).map((row) => {
      const proj = Array.isArray(row.projects) ? row.projects[0] : row.projects
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        location: row.location,
        starts_at: row.starts_at,
        ends_at: row.ends_at,
        all_day: row.all_day,
        project_id: row.project_id,
        project_name: (proj as { name?: string } | null)?.name || null,
        event_type: row.event_type || 'other',
      }
    })

    return NextResponse.json({ events })
  } catch (e) {
    console.error('[calendar/events GET]', e)
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const requestId = `calendar-event-${Date.now()}`
  try {
    const auth = await requireSessionClientIdWithNavFeature('calendar')
    if (!auth.ok) return auth.response

    const admin = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'calendar-events')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      return NextResponse.json({ error: 'גוף JSON לא תקין', requestId }, { status: 400 })
    }

    const parsed = createCalendarEventBodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten(), requestId }, { status: 400 })
    }

    const body = parsed.data
    if (new Date(body.ends_at) <= new Date(body.starts_at)) {
      return NextResponse.json({ error: 'שעת סיום חייבת להיות אחרי התחלה', requestId }, { status: 400 })
    }

    if (body.project_id) {
      const { data: proj, error: pErr } = await admin
        .from('projects')
        .select('id')
        .eq('id', body.project_id)
        .eq('client_id', auth.ctx.clientId)
        .maybeSingle()
      if (pErr || !proj) {
        return NextResponse.json({ error: 'פרויקט לא תקף', requestId }, { status: 403 })
      }
    }

    const now = new Date().toISOString()
    const { data, error } = await admin
      .from('calendar_events')
      .insert({
        client_id: auth.ctx.clientId,
        title: body.title,
        description: body.description ?? null,
        location: body.location ?? null,
        starts_at: body.starts_at,
        ends_at: body.ends_at,
        all_day: body.all_day ?? false,
        project_id: body.project_id ?? null,
        event_type: body.event_type ?? 'other',
        created_by: auth.ctx.userId,
        updated_at: now,
      })
      .select()
      .single()

    if (error) {
      console.error('[calendar/events POST]', error.message)
      return NextResponse.json({ error: 'שגיאת שרת', requestId }, { status: 500 })
    }

    return NextResponse.json({ event: data })
  } catch (e) {
    console.error('[calendar/events POST]', e)
    return NextResponse.json({ error: 'שגיאת שרת', requestId }, { status: 500 })
  }
}
