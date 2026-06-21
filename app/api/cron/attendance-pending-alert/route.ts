import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { verifyCronRequest } from '@/lib/cron-auth'
import { getLogger } from '@/lib/logging'
import { notifyManagerAttendanceReview } from '@/lib/attendance-manager-notify'

/** Daily digest: notify managers with pending_review attendance events. */
export async function GET(req: NextRequest) {
  const logger = getLogger()
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = getSupabaseAdmin()
    const { data: clients, error } = await admin
      .from('client_paid_addons')
      .select('client_id')
      .eq('addon_key', 'worker_stamp')
      .eq('enabled', true)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    let notified = 0
    for (const c of clients ?? []) {
      const clientId = (c as { client_id: string }).client_id
      const { count } = await admin
        .from('worker_attendance_events')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('sync_status', 'pending_review')

      const n = count ?? 0
      if (n > 0) {
        await notifyManagerAttendanceReview(admin, clientId, n)
        notified++
      }
    }

    logger.info('CRON', 'attendance-pending-alert done', { notified })
    return NextResponse.json({ ok: true, clients_notified: notified })
  } catch (e) {
    logger.error('CRON', 'attendance-pending-alert failed', e instanceof Error ? e : new Error(String(e)))
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
