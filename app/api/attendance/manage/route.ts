import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientIdWithNavFeature } from '@/lib/api-nav-guard'
import { getOfficeAttendanceScanUrl } from '@/lib/public-app-url'
import { isOutsideGeofence } from '@/lib/office-geo'
import { formatOfficeHoursBetween } from '@/lib/office-attendance'

const ENTRIES_LIMIT = 500
const STALE_SHIFT_HOURS = 10

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSessionClientIdWithNavFeature('attendance')
    if (!auth.ok) return auth.response

    const admin = getSupabaseAdmin()
    const clientId = auth.ctx.clientId

    const fromParam = req.nextUrl.searchParams.get('from')
    const toParam = req.nextUrl.searchParams.get('to')
    const now = new Date()
    const since = fromParam ? new Date(fromParam) : new Date(now.getFullYear(), now.getMonth(), 1)
    const until = toParam ? new Date(toParam) : new Date(now.getTime() + 1)

    const [clientRes, staffRes, entriesRes, openRes] = await Promise.all([
      admin
        .from('clients')
        .select(
          'office_attendance_station_token, office_geofence_lat, office_geofence_lng, office_geofence_radius_m'
        )
        .eq('id', clientId)
        .single(),
      admin
        .from('office_staff')
        .select('id, full_name, hourly_rate, is_active, created_at')
        .eq('client_id', clientId)
        .order('full_name'),
      admin
        .from('office_time_entries')
        .select(
          'id, staff_id, clock_in_at, clock_out_at, clock_in_lat, clock_in_lng, clock_out_lat, clock_out_lng, office_staff(full_name, hourly_rate)'
        )
        .eq('client_id', clientId)
        .gte('clock_in_at', since.toISOString())
        .lt('clock_in_at', until.toISOString())
        .order('clock_in_at', { ascending: false })
        .limit(ENTRIES_LIMIT),
      admin
        .from('office_time_entries')
        .select('id, staff_id, clock_in_at, office_staff(full_name)')
        .eq('client_id', clientId)
        .is('clock_out_at', null),
    ])

    if (clientRes.error) {
      console.error('[attendance/manage GET client]', clientRes.error.message)
      return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
    }

    const clientRow = clientRes.data as {
      office_attendance_station_token?: string | null
      office_geofence_lat?: number | null
      office_geofence_lng?: number | null
      office_geofence_radius_m?: number | null
    }

    let stationToken = clientRow.office_attendance_station_token
    if (!stationToken) {
      stationToken = crypto.randomUUID()
      await admin.from('clients').update({ office_attendance_station_token: stationToken }).eq('id', clientId)
    }

    if (staffRes.error || entriesRes.error || openRes.error) {
      console.error('[attendance/manage GET]', staffRes.error || entriesRes.error || openRes.error)
      return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
    }

    const geofence = {
      lat: clientRow.office_geofence_lat,
      lng: clientRow.office_geofence_lng,
      radius_m: clientRow.office_geofence_radius_m ?? 150,
    }

    const entries = (entriesRes.data || []).map((row) => {
      const staff = Array.isArray(row.office_staff) ? row.office_staff[0] : row.office_staff
      const staffName = (staff as { full_name?: string } | null)?.full_name || ''
      const hourlyRate = (staff as { hourly_rate?: number | null } | null)?.hourly_rate ?? null
      let hoursLabel = ''
      let cost: number | null = null
      if (row.clock_out_at) {
        hoursLabel = formatOfficeHoursBetween(row.clock_in_at, row.clock_out_at)
        if (hourlyRate != null) {
          const ms = new Date(row.clock_out_at).getTime() - new Date(row.clock_in_at).getTime()
          cost = Math.round((ms / 3600000) * Number(hourlyRate) * 100) / 100
        }
      }
      const geoWarnIn =
        row.clock_in_lat != null &&
        row.clock_in_lng != null &&
        isOutsideGeofence(row.clock_in_lat, row.clock_in_lng, geofence.lat, geofence.lng, geofence.radius_m)
      const geoWarnOut =
        row.clock_out_lat != null &&
        row.clock_out_lng != null &&
        isOutsideGeofence(row.clock_out_lat, row.clock_out_lng, geofence.lat, geofence.lng, geofence.radius_m)

      return {
        id: row.id,
        staff_id: row.staff_id,
        staff_name: staffName,
        clock_in_at: row.clock_in_at,
        clock_out_at: row.clock_out_at,
        clock_in_lat: row.clock_in_lat,
        clock_in_lng: row.clock_in_lng,
        clock_out_lat: row.clock_out_lat,
        clock_out_lng: row.clock_out_lng,
        hours_label: hoursLabel,
        cost,
        geofence_warning: geoWarnIn || geoWarnOut,
      }
    })

    const staleMs = STALE_SHIFT_HOURS * 3600000
    const open_shifts = (openRes.data || []).map((row) => {
      const staff = Array.isArray(row.office_staff) ? row.office_staff[0] : row.office_staff
      const clockIn = row.clock_in_at as string
      const openMs = Date.now() - new Date(clockIn).getTime()
      return {
        id: row.id,
        staff_id: row.staff_id,
        staff_name: (staff as { full_name?: string } | null)?.full_name || '',
        clock_in_at: clockIn,
        stale: openMs > staleMs,
      }
    })

    let totalHoursMonth = 0
    for (const e of entries) {
      if (!e.clock_out_at) continue
      totalHoursMonth += (new Date(e.clock_out_at).getTime() - new Date(e.clock_in_at).getTime()) / 3600000
    }

    return NextResponse.json({
      scan_url: getOfficeAttendanceScanUrl(stationToken),
      station_token: stationToken,
      staff: staffRes.data || [],
      entries,
      open_shifts,
      geofence,
      stats: {
        open_count: open_shifts.length,
        active_staff: (staffRes.data || []).filter((s) => s.is_active).length,
        total_hours: Math.round(totalHoursMonth * 10) / 10,
      },
      range: { from: since.toISOString(), to: until.toISOString() },
    })
  } catch (e) {
    console.error('[attendance/manage GET]', e)
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
