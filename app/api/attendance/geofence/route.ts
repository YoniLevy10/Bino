import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientIdWithNavFeature } from '@/lib/api-nav-guard'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { officeGeofenceBodySchema } from '@/lib/api-body-schemas'

export async function PATCH(req: Request) {
  const requestId = `geofence-${Date.now()}`
  try {
    const auth = await requireSessionClientIdWithNavFeature('attendance')
    if (!auth.ok) return auth.response

    const admin = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'attendance-geofence')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות', requestId }, { status: 429 })
    }

    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      return NextResponse.json({ error: 'גוף JSON לא תקין', requestId }, { status: 400 })
    }

    const parsed = officeGeofenceBodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten(), requestId }, { status: 400 })
    }

    const { error } = await admin
      .from('clients')
      .update({
        office_geofence_lat: parsed.data.office_geofence_lat,
        office_geofence_lng: parsed.data.office_geofence_lng,
        office_geofence_radius_m: parsed.data.office_geofence_radius_m ?? 150,
      })
      .eq('id', auth.ctx.clientId)

    if (error) {
      return NextResponse.json({ error: 'שגיאת שרת', requestId }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[attendance/geofence]', e)
    return NextResponse.json({ error: 'שגיאת שרת', requestId }, { status: 500 })
  }
}
