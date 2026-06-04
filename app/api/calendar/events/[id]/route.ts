import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { updateCalendarEventBodySchema } from '@/lib/api-body-schemas'

type RouteCtx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: RouteCtx) {
  const requestId = `calendar-patch-${Date.now()}`
  try {
    const { id } = await ctx.params
    const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.calendar)
    if (!auth.ok) return auth.response

    const admin = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'calendar-event-patch')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות', requestId }, { status: 429 })
    }

    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      return NextResponse.json({ error: 'גוף JSON לא תקין', requestId }, { status: 400 })
    }

    const parsed = updateCalendarEventBodySchema.safeParse({ ...(raw as object), id })
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten(), requestId }, { status: 400 })
    }

    const body = parsed.data
    if (body.starts_at && body.ends_at && new Date(body.ends_at) <= new Date(body.starts_at)) {
      return NextResponse.json({ error: 'שעת סיום חייבת להיות אחרי התחלה', requestId }, { status: 400 })
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.title !== undefined) patch.title = body.title
    if (body.description !== undefined) patch.description = body.description
    if (body.location !== undefined) patch.location = body.location
    if (body.starts_at !== undefined) patch.starts_at = body.starts_at
    if (body.ends_at !== undefined) patch.ends_at = body.ends_at
    if (body.all_day !== undefined) patch.all_day = body.all_day
    if (body.project_id !== undefined) patch.project_id = body.project_id
    if (body.event_type !== undefined) patch.event_type = body.event_type

    const { data, error } = await admin
      .from('calendar_events')
      .update(patch)
      .eq('id', id)
      .eq('client_id', auth.ctx.clientId)
      .select()
      .single()

    if (error) {
      console.error('[calendar PATCH]', error.message)
      return NextResponse.json({ error: 'שגיאת שרת', requestId }, { status: 500 })
    }

    return NextResponse.json({ event: data })
  } catch (e) {
    console.error('[calendar PATCH]', e)
    return NextResponse.json({ error: 'שגיאת שרת', requestId }, { status: 500 })
  }
}

export async function DELETE(_req: Request, ctx: RouteCtx) {
  const requestId = `calendar-del-${Date.now()}`
  try {
    const { id } = await ctx.params
    const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.calendar)
    if (!auth.ok) return auth.response

    const admin = getSupabaseAdmin()
    const { error } = await admin
      .from('calendar_events')
      .delete()
      .eq('id', id)
      .eq('client_id', auth.ctx.clientId)

    if (error) {
      console.error('[calendar DELETE]', error.message)
      return NextResponse.json({ error: 'שגיאת שרת', requestId }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[calendar DELETE]', e)
    return NextResponse.json({ error: 'שגיאת שרת', requestId }, { status: 500 })
  }
}
