import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedReadRouteLimit } from '@/lib/rate-limit'
import { requireClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'

export async function GET(req: NextRequest) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedReadRouteLimit(admin, auth.ctx.userId, 'attendance-events-get')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות' }, { status: 429 })
  }

  const clientId = auth.ctx.clientId
  const addonCheck = await requireClientPaidAddon(admin, clientId, PAID_ADDON_KEYS.worker_stamp)
  if (!addonCheck.ok) return addonCheck.response

  const sp = req.nextUrl.searchParams
  const from = sp.get('from')
  const to = sp.get('to')
  const workerId = sp.get('worker_id')
  const projectId = sp.get('project_id')
  const source = sp.get('source')
  const syncStatus = sp.get('sync_status')
  const limit = Math.min(500, Math.max(1, Number(sp.get('limit') || 200)))

  let q = admin
    .from('worker_attendance_events')
    .select(
      `
      id,
      worker_id,
      project_id,
      tag_code,
      event_type,
      client_recorded_at,
      server_received_at,
      source,
      sync_status,
      sync_delay_minutes,
      suspicious_reason,
      admin_note,
      note,
      workers ( full_name ),
      projects ( name )
    `
    )
    .eq('client_id', clientId)
    .order('client_recorded_at', { ascending: false })
    .limit(limit)

  if (from) q = q.gte('client_recorded_at', from)
  if (to) q = q.lte('client_recorded_at', to)
  if (workerId) q = q.eq('worker_id', workerId)
  if (projectId) q = q.eq('project_id', projectId)
  if (source === 'online' || source === 'offline') q = q.eq('source', source)
  if (syncStatus) q = q.eq('sync_status', syncStatus)

  const { data, error } = await q
  if (error) {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }

  const { count: pendingReview } = await admin
    .from('worker_attendance_events')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('sync_status', 'pending_review')

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayIso = todayStart.toISOString()

  const { count: clockInsToday } = await admin
    .from('worker_attendance_events')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('event_type', 'clock_in')
    .gte('client_recorded_at', todayIso)

  const { count: visitsToday } = await admin
    .from('worker_attendance_events')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('event_type', 'project_visit')
    .gte('client_recorded_at', todayIso)

  const { count: activeNow } = await admin
    .from('worker_attendance')
    .select('*', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('status', 'open')

  return NextResponse.json({
    events: data ?? [],
    kpis: {
      active_workers_now: activeNow ?? 0,
      clock_ins_today: clockInsToday ?? 0,
      project_visits_today: visitsToday ?? 0,
      pending_review: pendingReview ?? 0,
    },
  })
}
