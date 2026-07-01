import { NextResponse } from 'next/server'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedReadRouteLimit } from '@/lib/rate-limit'
import { requireClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'

function todayBounds(): { start: string; end: string } {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const end = new Date()
  end.setHours(23, 59, 59, 999)
  return { start: start.toISOString(), end: end.toISOString() }
}

/** Manager dashboard: who is working today, who clocked in, open shifts. */
export async function GET() {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = auth.ctx.admin
  const rl = await checkAuthenticatedReadRouteLimit(admin, auth.ctx.userId, 'attendance-today-get')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const addonCheck = await requireClientPaidAddon(admin, auth.ctx.clientId, PAID_ADDON_KEYS.worker_stamp)
  if (!addonCheck.ok) return addonCheck.response

  const clientId = auth.ctx.clientId
  const { start, end } = todayBounds()

  const [openRes, clockInRes, missingRes] = await Promise.all([
    admin
      .from('worker_attendance')
      .select('id, worker_id, started_at, workers(full_name)')
      .eq('client_id', clientId)
      .eq('status', 'open')
      .order('started_at', { ascending: false }),
    admin
      .from('worker_attendance_events')
      .select('worker_id, workers(full_name)')
      .eq('client_id', clientId)
      .eq('event_type', 'clock_in')
      .gte('client_recorded_at', start)
      .lte('client_recorded_at', end),
    admin
      .from('worker_attendance')
      .select('id, worker_id, started_at, workers(full_name)')
      .eq('client_id', clientId)
      .eq('status', 'missing_checkout')
      .order('started_at', { ascending: false })
      .limit(20),
  ])

  type Row = { worker_id: string; workers?: { full_name?: string } | { full_name?: string }[] | null }
  const nameOf = (r: Row) => {
    const w = r.workers
    if (!w) return '—'
    if (Array.isArray(w)) return w[0]?.full_name ?? '—'
    return w.full_name ?? '—'
  }

  const activeNow = (openRes.data ?? []).map((r) => ({
    worker_id: (r as Row).worker_id,
    full_name: nameOf(r as Row),
    started_at: (r as { started_at: string }).started_at,
  }))

  const clockInIds = new Set<string>()
  const clockedInToday: { worker_id: string; full_name: string }[] = []
  for (const r of clockInRes.data ?? []) {
    const id = (r as Row).worker_id
    if (clockInIds.has(id)) continue
    clockInIds.add(id)
    clockedInToday.push({ worker_id: id, full_name: nameOf(r as Row) })
  }

  const missingCheckout = (missingRes.data ?? []).map((r) => ({
    worker_id: (r as Row).worker_id,
    full_name: nameOf(r as Row),
    started_at: (r as { started_at: string }).started_at,
  }))

  return NextResponse.json({
    active_now: activeNow,
    clocked_in_today: clockedInToday,
    missing_checkout: missingCheckout,
  })
}
