import { NextRequest, NextResponse } from 'next/server'
import { requireSessionClientId, requireSessionMinRole } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit, checkAuthenticatedReadRouteLimit } from '@/lib/rate-limit'
import { requireClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { createWorkerAttendanceShiftBodySchema } from '@/lib/api-body-schemas'
import { buildManualShiftRow } from '@/lib/attendance-shift-manual'

/** Tenant: shift rows for hours report / Excel export. */
export async function GET(req: NextRequest) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = auth.ctx.admin
  const rl = await checkAuthenticatedReadRouteLimit(admin, auth.ctx.userId, 'attendance-shifts-get')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const addonCheck = await requireClientPaidAddon(admin, auth.ctx.clientId, PAID_ADDON_KEYS.worker_stamp)
  if (!addonCheck.ok) return addonCheck.response

  const sp = req.nextUrl.searchParams
  const from = sp.get('from')
  const to = sp.get('to')
  const workerId = sp.get('worker_id')
  const limit = Math.min(2000, Math.max(1, Number(sp.get('limit') || 500)))

  let q = admin
    .from('worker_attendance')
    .select(
      `
      id,
      worker_id,
      started_at,
      ended_at,
      total_minutes,
      status,
      admin_note,
      start_source,
      end_source,
      workers ( full_name, hourly_rate )
    `
    )
    .eq('client_id', auth.ctx.clientId)
    .order('started_at', { ascending: false })
    .limit(limit)

  if (from) q = q.gte('started_at', from)
  if (to) q = q.lte('started_at', to)
  if (workerId) q = q.eq('worker_id', workerId)

  const { data, error } = await q
  if (error) {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }

  return NextResponse.json({ shifts: data ?? [] })
}

/** Manager: create a shift manually (backfill / correction). */
export async function POST(req: NextRequest) {
  const auth = await requireSessionMinRole('manager')
  if (!auth.ok) return auth.response

  const admin = auth.ctx.admin
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'attendance-shift-create')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const addonCheck = await requireClientPaidAddon(admin, auth.ctx.clientId, PAID_ADDON_KEYS.worker_stamp)
  if (!addonCheck.ok) return addonCheck.response

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON לא תקין' }, { status: 400 })
  }

  const parsed = createWorkerAttendanceShiftBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { worker_id } = parsed.data

  const { data: worker, error: workerErr } = await admin
    .from('workers')
    .select('id')
    .eq('id', worker_id)
    .eq('client_id', auth.ctx.clientId)
    .is('deleted_at', null)
    .maybeSingle()

  if (workerErr || !worker) {
    return NextResponse.json({ error: 'עובד לא נמצא' }, { status: 404 })
  }

  let shiftRow
  try {
    shiftRow = buildManualShiftRow(parsed.data)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'נתונים לא תקינים' },
      { status: 400 }
    )
  }

  if (shiftRow.status === 'open') {
    const { data: openShift } = await admin
      .from('worker_attendance')
      .select('id')
      .eq('client_id', auth.ctx.clientId)
      .eq('worker_id', worker_id)
      .eq('status', 'open')
      .maybeSingle()

    if (openShift) {
      return NextResponse.json(
        { error: 'לעובד כבר יש משמרת פתוחה — סגרו אותה לפני פתיחת משמרת חדשה' },
        { status: 409 }
      )
    }
  }

  const now = new Date().toISOString()
  const { data: created, error } = await admin
    .from('worker_attendance')
    .insert({
      client_id: auth.ctx.clientId,
      worker_id,
      ...shiftRow,
      edited_at: now,
      edited_by: auth.ctx.userId,
      updated_at: now,
    })
    .select('id, worker_id, started_at, ended_at, total_minutes, status, admin_note')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ shift: created }, { status: 201 })
}
