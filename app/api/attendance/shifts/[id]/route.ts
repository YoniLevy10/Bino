import { NextRequest, NextResponse } from 'next/server'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { patchWorkerAttendanceShiftBodySchema } from '@/lib/api-body-schemas'

function computeTotalMinutes(startedAt: string, endedAt: string | null): number | null {
  if (!endedAt) return null
  const a = new Date(startedAt).getTime()
  const b = new Date(endedAt).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null
  return Math.round((b - a) / 60_000)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = auth.ctx.admin
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'attendance-shift-patch')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const addonCheck = await requireClientPaidAddon(admin, auth.ctx.clientId, PAID_ADDON_KEYS.worker_stamp)
  if (!addonCheck.ok) return addonCheck.response

  const { id } = await params
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
  }

  const parsed = patchWorkerAttendanceShiftBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { data: existing, error: fetchErr } = await admin
    .from('worker_attendance')
    .select('id, client_id, started_at, ended_at, status')
    .eq('id', id)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'משמרת לא נמצאה' }, { status: 404 })
  }

  const started_at = parsed.data.started_at ?? (existing as { started_at: string }).started_at
  const ended_at =
    parsed.data.ended_at !== undefined
      ? parsed.data.ended_at
      : ((existing as { ended_at?: string | null }).ended_at ?? null)

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    edited_at: new Date().toISOString(),
    edited_by: auth.ctx.userId,
  }

  if (parsed.data.started_at) patch.started_at = parsed.data.started_at
  if (parsed.data.ended_at !== undefined) patch.ended_at = parsed.data.ended_at
  if (parsed.data.status) patch.status = parsed.data.status
  if (parsed.data.admin_note !== undefined) patch.admin_note = parsed.data.admin_note

  if (ended_at) {
    patch.total_minutes = computeTotalMinutes(started_at, ended_at)
  }

  const { data: updated, error } = await admin
    .from('worker_attendance')
    .update(patch)
    .eq('id', id)
    .eq('client_id', auth.ctx.clientId)
    .select('id, worker_id, started_at, ended_at, total_minutes, status, admin_note')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ shift: updated })
}
