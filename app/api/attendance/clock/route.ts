import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { officeAttendanceClockBodySchema } from '@/lib/api-body-schemas'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'
import {
  formatOfficeClockTime,
  resolveClientByStationToken,
  resolveOrCreateOfficeStaffByName,
  toggleOfficeClock,
} from '@/lib/office-attendance'
import { formatZodError } from '@/lib/format-zod-error'
import { isOutsideGeofence } from '@/lib/office-geo'

function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
}

export async function POST(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const ip = clientIp(req)
    const rl = await checkIpPostRouteLimit(admin, ip, 'attendance-clock')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
    }

    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      return NextResponse.json({ error: 'גוף JSON לא תקין' }, { status: 400 })
    }

    const parsed = officeAttendanceClockBodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 })
    }

    const { station_token, staff_id, guest_name, lat, lng, accuracy_m } = parsed.data
    const client = await resolveClientByStationToken(station_token)
    if (!client) {
      return NextResponse.json({ error: 'תחנת כניסה לא תקין' }, { status: 404 })
    }

    let resolvedStaffId = staff_id
    if (!resolvedStaffId && guest_name?.trim()) {
      const created = await resolveOrCreateOfficeStaffByName(client.clientId, guest_name)
      if (!created) {
        return NextResponse.json({ error: 'שם לא תקין' }, { status: 400 })
      }
      resolvedStaffId = created.id
    }
    if (!resolvedStaffId) {
      return NextResponse.json({ error: 'נדרש עובד או שם' }, { status: 400 })
    }

    const geo =
      lat !== undefined && lng !== undefined
        ? { lat, lng, accuracy_m: accuracy_m ?? null }
        : null

    let geofenceWarning = false
    if (geo) {
      const admin = getSupabaseAdmin()
      const { data: clientRow } = await admin
        .from('clients')
        .select('office_geofence_lat, office_geofence_lng, office_geofence_radius_m')
        .eq('id', client.clientId)
        .maybeSingle()
      if (clientRow) {
        geofenceWarning = isOutsideGeofence(
          geo.lat,
          geo.lng,
          clientRow.office_geofence_lat,
          clientRow.office_geofence_lng,
          clientRow.office_geofence_radius_m
        )
      }
    }

    const result = await toggleOfficeClock({
      clientId: client.clientId,
      staffId: resolvedStaffId,
      geo,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 })
    }

    const timeLabel = formatOfficeClockTime(result.at)
    const message =
      result.action === 'in'
        ? `${result.staffName} — נרשמה כניסה בשעה ${timeLabel}`
        : `${result.staffName} — נרשמה יציאה בשעה ${timeLabel}`

    return NextResponse.json({
      action: result.action,
      staff_name: result.staffName,
      at: result.at,
      message,
      location_recorded: geo !== null,
      geofence_warning: geofenceWarning,
      clock_in_at: result.action === 'out' && 'clockInAt' in result ? result.clockInAt : undefined,
    })
  } catch (e) {
    console.error('[attendance/clock POST]', e)
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
