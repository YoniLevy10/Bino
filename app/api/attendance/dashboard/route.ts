import { NextRequest, NextResponse } from 'next/server'
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

type WorkerRow = { full_name?: string } | { full_name?: string }[] | null

function workerName(w: WorkerRow): string {
  if (!w) return '—'
  if (Array.isArray(w)) return w[0]?.full_name ?? '—'
  return w.full_name ?? '—'
}

/** Single load for /attendance current tab — one auth + one rate-limit check. */
export async function GET(req: NextRequest) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = auth.ctx.admin
  const rl = await checkAuthenticatedReadRouteLimit(admin, auth.ctx.userId, 'attendance-dashboard-get')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const addonCheck = await requireClientPaidAddon(admin, auth.ctx.clientId, PAID_ADDON_KEYS.worker_stamp)
  if (!addonCheck.ok) return addonCheck.response

  const clientId = auth.ctx.clientId
  const sp = req.nextUrl.searchParams
  const from = sp.get('from')
  const to = sp.get('to')
  const syncStatus = sp.get('sync_status')
  const eventsLimit = Math.min(500, Math.max(1, Number(sp.get('limit') || 500)))

  if (!from || !to) {
    return NextResponse.json({ error: 'נדרש טווח תאריכים (from, to)' }, { status: 400 })
  }

  const { start: todayStart, end: todayEnd } = todayBounds()

  let eventsQuery = admin
    .from('worker_attendance_events')
    .select(
      `
      id,
      worker_id,
      project_id,
      tag_code,
      event_type,
      client_recorded_at,
      sync_status,
      workers ( full_name ),
      projects ( name )
    `
    )
    .eq('client_id', clientId)
    .gte('client_recorded_at', from)
    .lte('client_recorded_at', to)
    .order('client_recorded_at', { ascending: false })
    .limit(eventsLimit)

  if (syncStatus) eventsQuery = eventsQuery.eq('sync_status', syncStatus)

  const [
    eventsRes,
    tagsRes,
    openRes,
    clockInRes,
    missingShiftRes,
    pendingRes,
    conflictRes,
    suspiciousRes,
    shiftsRes,
    stickerRes,
    pendingCountRes,
    clockInsTodayRes,
    visitsTodayRes,
    activeNowRes,
  ] = await Promise.all([
    eventsQuery,
    admin
      .from('worker_nfc_tags')
      .select('id')
      .eq('client_id', clientId)
      .eq('is_active', true),
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
      .gte('client_recorded_at', todayStart)
      .lte('client_recorded_at', todayEnd),
    admin
      .from('worker_attendance')
      .select('id, worker_id, started_at, workers(full_name)')
      .eq('client_id', clientId)
      .eq('status', 'missing_checkout')
      .order('started_at', { ascending: false })
      .limit(30),
    admin
      .from('worker_attendance_events')
      .select('id, worker_id, event_type, client_recorded_at, sync_status, workers(full_name)')
      .eq('client_id', clientId)
      .eq('sync_status', 'pending_review')
      .order('client_recorded_at', { ascending: false })
      .limit(50),
    admin
      .from('worker_attendance_events')
      .select('id, worker_id, event_type, client_recorded_at, sync_status, suspicious_reason, workers(full_name)')
      .eq('client_id', clientId)
      .eq('sync_status', 'conflict')
      .order('client_recorded_at', { ascending: false })
      .limit(30),
    admin
      .from('worker_attendance_events')
      .select('id, worker_id, event_type, client_recorded_at, sync_delay_minutes, suspicious_reason, workers(full_name)')
      .eq('client_id', clientId)
      .not('suspicious_reason', 'is', null)
      .order('client_recorded_at', { ascending: false })
      .limit(30),
    admin
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
        workers ( full_name, hourly_rate )
      `
      )
      .eq('client_id', clientId)
      .gte('started_at', from)
      .lte('started_at', to)
      .order('started_at', { ascending: false })
      .limit(2000),
    admin
      .from('worker_nfc_tags')
      .select('sticker_installed_at')
      .eq('client_id', clientId)
      .eq('is_active', true),
    admin
      .from('worker_attendance_events')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('sync_status', 'pending_review'),
    admin
      .from('worker_attendance_events')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('event_type', 'clock_in')
      .gte('client_recorded_at', todayStart),
    admin
      .from('worker_attendance_events')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('event_type', 'project_visit')
      .gte('client_recorded_at', todayStart),
    admin
      .from('worker_attendance')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('status', 'open'),
  ])

  if (eventsRes.error) {
    return NextResponse.json({ error: eventsRes.error.message }, { status: 500 })
  }

  const events = eventsRes.data ?? []
  const projectVisits = events.filter((e) => (e as { event_type?: string }).event_type === 'project_visit')

  type OpenRow = { worker_id: string; started_at: string; workers?: WorkerRow }
  const activeNow = (openRes.data ?? []).map((r) => {
    const row = r as OpenRow
    return {
      worker_id: row.worker_id,
      full_name: workerName(row.workers ?? null),
      started_at: row.started_at,
    }
  })

  const clockInIds = new Set<string>()
  const clockedInToday: { worker_id: string; full_name: string }[] = []
  for (const r of clockInRes.data ?? []) {
    const row = r as { worker_id: string; workers?: WorkerRow }
    if (clockInIds.has(row.worker_id)) continue
    clockInIds.add(row.worker_id)
    clockedInToday.push({ worker_id: row.worker_id, full_name: workerName(row.workers ?? null) })
  }

  const missingCheckout = (missingShiftRes.data ?? []).map((r) => {
    const row = r as OpenRow
    return {
      worker_id: row.worker_id,
      full_name: workerName(row.workers ?? null),
      started_at: row.started_at,
    }
  })

  const stickerTags = stickerRes.data ?? []
  const stickerInstalled = stickerTags.filter(
    (t) => (t as { sticker_installed_at?: string | null }).sticker_installed_at
  ).length

  return NextResponse.json({
    events,
    kpis: {
      active_workers_now: activeNowRes.count ?? 0,
      clock_ins_today: clockInsTodayRes.count ?? 0,
      project_visits_today: visitsTodayRes.count ?? 0,
      pending_review: pendingCountRes.count ?? 0,
    },
    tag_count: (tagsRes.data ?? []).length,
    today_summary: {
      active_now: activeNow,
      clocked_in_today: clockedInToday,
      missing_checkout: missingCheckout,
    },
    anomalies: {
      pending_review: pendingRes.data ?? [],
      conflicts: conflictRes.data ?? [],
      missing_checkout: missingShiftRes.data ?? [],
      suspicious: suspiciousRes.data ?? [],
    },
    live_workers: openRes.data ?? [],
    sticker: {
      installed: stickerInstalled,
      total: stickerTags.length,
    },
    shifts: shiftsRes.data ?? [],
    project_visits: projectVisits,
  })
}
