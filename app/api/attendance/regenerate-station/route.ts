import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientIdWithNavFeature } from '@/lib/api-nav-guard'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { getOfficeAttendanceScanUrl } from '@/lib/public-app-url'

export async function POST() {
  const requestId = `regen-station-${Date.now()}`
  try {
    const auth = await requireSessionClientIdWithNavFeature('attendance')
    if (!auth.ok) return auth.response

    const admin = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'attendance-regen-station')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות', requestId }, { status: 429 })
    }

    const token = crypto.randomUUID()
    const { error } = await admin
      .from('clients')
      .update({ office_attendance_station_token: token })
      .eq('id', auth.ctx.clientId)

    if (error) {
      return NextResponse.json({ error: 'שגיאת שרת', requestId }, { status: 500 })
    }

    return NextResponse.json({
      scan_url: getOfficeAttendanceScanUrl(token),
      station_token: token,
    })
  } catch (e) {
    console.error('[attendance/regenerate-station]', e)
    return NextResponse.json({ error: 'שגיאת שרת', requestId }, { status: 500 })
  }
}
