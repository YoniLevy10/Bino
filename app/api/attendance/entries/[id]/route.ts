import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientIdWithNavFeature } from '@/lib/api-nav-guard'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { patchOfficeTimeEntryBodySchema } from '@/lib/api-body-schemas'
import { logAudit } from '@/lib/audit'

type RouteCtx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, ctx: RouteCtx) {
  const requestId = `attendance-entry-${Date.now()}`
  try {
    const { id } = await ctx.params
    const auth = await requireSessionClientIdWithNavFeature('attendance')
    if (!auth.ok) return auth.response

    const admin = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'attendance-entry-patch')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות', requestId }, { status: 429 })
    }

    let raw: unknown
    try {
      raw = await req.json()
    } catch {
      return NextResponse.json({ error: 'גוף JSON לא תקין', requestId }, { status: 400 })
    }

    const parsed = patchOfficeTimeEntryBodySchema.safeParse({ ...(raw as object), id })
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten(), requestId }, { status: 400 })
    }

    const { data: existing, error: findErr } = await admin
      .from('office_time_entries')
      .select('id, clock_in_at, clock_out_at')
      .eq('id', id)
      .eq('client_id', auth.ctx.clientId)
      .maybeSingle()

    if (findErr || !existing) {
      return NextResponse.json({ error: 'רישום לא נמצא', requestId }, { status: 404 })
    }

    const patch: Record<string, string | null> = {}
    if (parsed.data.clock_in_at !== undefined) patch.clock_in_at = parsed.data.clock_in_at
    if (parsed.data.clock_out_at !== undefined) patch.clock_out_at = parsed.data.clock_out_at

    const inAt = new Date(patch.clock_in_at ?? existing.clock_in_at)
    const outAt = patch.clock_out_at != null ? new Date(patch.clock_out_at) : existing.clock_out_at ? new Date(existing.clock_out_at) : null
    if (outAt && outAt <= inAt) {
      return NextResponse.json({ error: 'שעת יציאה חייבת להיות אחרי כניסה', requestId }, { status: 400 })
    }

    const { data, error } = await admin
      .from('office_time_entries')
      .update(patch)
      .eq('id', id)
      .eq('client_id', auth.ctx.clientId)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: 'שגיאת שרת', requestId }, { status: 500 })
    }

    await logAudit({
      clientId: auth.ctx.clientId,
      userId: auth.ctx.userId,
      action: 'PATCH_OFFICE_TIME_ENTRY',
      entityType: 'office_time_entry',
      entityId: id,
      oldValues: existing,
      newValues: data,
    })

    return NextResponse.json({ entry: data })
  } catch (e) {
    console.error('[attendance/entries PATCH]', e)
    return NextResponse.json({ error: 'שגיאת שרת', requestId }, { status: 500 })
  }
}
