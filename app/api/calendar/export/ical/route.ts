import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientIdWithNavFeature } from '@/lib/api-nav-guard'
import { buildIcalCalendar } from '@/lib/calendar-utils'

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSessionClientIdWithNavFeature('calendar')
    if (!auth.ok) return auth.response

    const from = req.nextUrl.searchParams.get('from')
    const to = req.nextUrl.searchParams.get('to')
    if (!from || !to) {
      return NextResponse.json({ error: 'נדרשים from ו-to' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from('calendar_events')
      .select('id, title, description, location, starts_at, ends_at')
      .eq('client_id', auth.ctx.clientId)
      .lt('starts_at', to)
      .gt('ends_at', from)
      .order('starts_at')

    if (error) {
      return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
    }

    const ical = buildIcalCalendar(data || [], 'Bamakor Office')
    return new NextResponse(ical, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="bamakor-calendar.ics"',
      },
    })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
