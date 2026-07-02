import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { attendanceEventReviewBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { applyShiftWhenEventApproved } from '@/lib/attendance-event-shift-apply'

export async function PATCH(req: Request) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'attendance-review')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
  }

  const parsed = attendanceEventReviewBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { event_id, sync_status, admin_note } = parsed.data

  const addonCheck = await requireClientPaidAddon(admin, auth.ctx.clientId, PAID_ADDON_KEYS.worker_stamp)
  if (!addonCheck.ok) return addonCheck.response

  const { data: existing, error: existingErr } = await admin
    .from('worker_attendance_events')
    .select('id, worker_id, event_type, client_recorded_at, tag_id, source, sync_status')
    .eq('id', event_id)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()

  if (existingErr || !existing) {
    return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })
  }

  const previousStatus = (existing as { sync_status?: string }).sync_status

  const { data: updated, error } = await admin
    .from('worker_attendance_events')
    .update({
      sync_status,
      admin_note: admin_note ?? null,
    })
    .eq('id', event_id)
    .eq('client_id', auth.ctx.clientId)
    .select('id, sync_status, admin_note')
    .single()

  if (error || !updated) {
    return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })
  }

  if (
    sync_status === 'synced' &&
    (previousStatus === 'pending_review' || previousStatus === 'conflict')
  ) {
    await applyShiftWhenEventApproved(admin, auth.ctx.clientId, existing as {
      id: string
      worker_id: string
      event_type: string
      client_recorded_at: string
      tag_id: string | null
      source: string | null
    })
  }

  return NextResponse.json({ success: true, event: updated })
}
