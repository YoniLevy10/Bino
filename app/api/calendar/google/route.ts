import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import {
  isGoogleCalendarSyncConfigured,
  loadGoogleCalendarConnection,
} from '@/lib/google-calendar'

export async function GET() {
  try {
    const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.calendar)
    if (!auth.ok) return auth.response

    const admin = getSupabaseAdmin()
    const conn = await loadGoogleCalendarConnection(admin, auth.ctx.clientId)

    return NextResponse.json({
      configured: isGoogleCalendarSyncConfigured(),
      connected: Boolean(conn),
      google_email: conn?.google_email ?? null,
      connected_by_me: conn ? conn.user_id === auth.ctx.userId : false,
    })
  } catch (e) {
    console.error('[calendar/google GET]', e)
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}

/** Disconnect Google Calendar for this tenant. */
export async function DELETE() {
  const requestId = `gcal-disconnect-${Date.now()}`
  try {
    const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.calendar)
    if (!auth.ok) return auth.response

    const admin = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'calendar-google-disconnect')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות', requestId }, { status: 429 })
    }

    const { error } = await admin
      .from('google_calendar_connections')
      .delete()
      .eq('client_id', auth.ctx.clientId)

    if (error) {
      console.error('[calendar/google DELETE]', error.message)
      return NextResponse.json({ error: 'שגיאת שרת', requestId }, { status: 500 })
    }

    return NextResponse.json({ ok: true, requestId })
  } catch (e) {
    console.error('[calendar/google DELETE]', e)
    return NextResponse.json({ error: 'שגיאת שרת', requestId }, { status: 500 })
  }
}
