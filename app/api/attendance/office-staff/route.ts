import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientIdWithNavFeature } from '@/lib/api-nav-guard'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { upsertOfficeStaffBodySchema } from '@/lib/api-body-schemas'

export async function POST(req: Request) {
  const requestId = `office-staff-${Date.now()}`
  try {
    const auth = await requireSessionClientIdWithNavFeature('attendance')
    if (!auth.ok) return auth.response

    const admin = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'attendance-office-staff')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      return NextResponse.json({ error: 'גוף JSON לא תקין', requestId }, { status: 400 })
    }

    const parsed = upsertOfficeStaffBodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten(), requestId }, { status: 400 })
    }

    const { id, full_name, hourly_rate, is_active } = parsed.data
    const clientId = auth.ctx.clientId
    const now = new Date().toISOString()

    if (id) {
      const { data: existing, error: findErr } = await admin
        .from('office_staff')
        .select('id')
        .eq('id', id)
        .eq('client_id', clientId)
        .maybeSingle()

      if (findErr || !existing) {
        return NextResponse.json({ error: 'עובדת לא נמצאה', requestId }, { status: 404 })
      }

      const { data, error } = await admin
        .from('office_staff')
        .update({
          full_name,
          hourly_rate: hourly_rate ?? null,
          is_active: is_active ?? true,
          updated_at: now,
        })
        .eq('id', id)
        .eq('client_id', clientId)
        .select()
        .single()

      if (error) {
        console.error('[attendance/office-staff PATCH]', error.message)
        return NextResponse.json({ error: 'שגיאת שרת', requestId }, { status: 500 })
      }
      return NextResponse.json({ staff: data })
    }

    const { data, error } = await admin
      .from('office_staff')
      .insert({
        client_id: clientId,
        full_name,
        hourly_rate: hourly_rate ?? null,
        is_active: is_active ?? true,
        updated_at: now,
      })
      .select()
      .single()

    if (error) {
      console.error('[attendance/office-staff POST]', error.message)
      return NextResponse.json({ error: 'שגיאת שרת', requestId }, { status: 500 })
    }

    return NextResponse.json({ staff: data })
  } catch (e) {
    console.error('[attendance/office-staff]', e)
    return NextResponse.json({ error: 'שגיאת שרת', requestId }, { status: 500 })
  }
}
