import { NextResponse } from 'next/server'
import { requireSessionClientId } from '@/lib/api-auth'
import { requireClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'

/** Anomalies needing manager attention (Hebrew-friendly labels client-side). */
export async function GET() {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = auth.ctx.admin
  const addonCheck = await requireClientPaidAddon(admin, auth.ctx.clientId, PAID_ADDON_KEYS.worker_stamp)
  if (!addonCheck.ok) return addonCheck.response

  const clientId = auth.ctx.clientId

  const [pendingRes, conflictRes, missingRes, delayRes] = await Promise.all([
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
      .from('worker_attendance')
      .select('id, worker_id, started_at, status, workers(full_name)')
      .eq('client_id', clientId)
      .eq('status', 'missing_checkout')
      .order('started_at', { ascending: false })
      .limit(30),
    admin
      .from('worker_attendance_events')
      .select('id, worker_id, event_type, client_recorded_at, sync_delay_minutes, suspicious_reason, workers(full_name)')
      .eq('client_id', clientId)
      .not('suspicious_reason', 'is', null)
      .order('client_recorded_at', { ascending: false })
      .limit(30),
  ])

  return NextResponse.json({
    pending_review: pendingRes.data ?? [],
    conflicts: conflictRes.data ?? [],
    missing_checkout: missingRes.data ?? [],
    suspicious: delayRes.data ?? [],
  })
}
