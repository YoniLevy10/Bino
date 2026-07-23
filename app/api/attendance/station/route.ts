import { NextRequest, NextResponse } from 'next/server'
import { sanitizeId } from '@/lib/api-validation'
import { listActiveOfficeStaff, resolveClientByStationToken } from '@/lib/office-attendance'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkIpGetRouteLimit } from '@/lib/rate-limit'

export async function GET(req: NextRequest) {
  try {
    const st = sanitizeId(req.nextUrl.searchParams.get('st'))
    if (!st) {
      return NextResponse.json({ error: 'קישור לא תקין' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()
    const ipFwd =
      (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'unknown'
    const rl = await checkIpGetRouteLimit(admin, ipFwd, 'attendance-station')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות, נסה שוב בעוד דקה' }, { status: 429 })
    }

    const client = await resolveClientByStationToken(st)
    if (!client) {
      return NextResponse.json({ error: 'תחנת כניסה לא נמצאה' }, { status: 404 })
    }

    const staff = await listActiveOfficeStaff(client.clientId)
    const { data: openRows } = await admin
      .from('office_time_entries')
      .select('staff_id, clock_in_at')
      .eq('client_id', client.clientId)
      .is('clock_out_at', null)
    const openMap = new Map(
      (openRows || []).map((r) => [r.staff_id as string, r.clock_in_at as string])
    )

    return NextResponse.json({
      client_name: client.clientName,
      staff: staff.map((s) => ({
        id: s.id,
        full_name: s.full_name,
        is_clocked_in: openMap.has(s.id),
        open_clock_in_at: openMap.get(s.id) ?? null,
      })),
    })
  } catch (e) {
    console.error('[attendance/station GET]', e)
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
