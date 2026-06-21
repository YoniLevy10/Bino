import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { verifyCronRequest } from '@/lib/cron-auth'
import { getLogger } from '@/lib/logging'
import { notifyWorkerOpenShiftReminderPush } from '@/lib/push-notifications'

const REMINDER_HOURS = 10

/** Push workers who still have an open shift after N hours. */
export async function GET(req: NextRequest) {
  const logger = getLogger()
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = getSupabaseAdmin()
    const cutoff = new Date(Date.now() - REMINDER_HOURS * 3_600_000).toISOString()

    const { data: rows, error } = await admin
      .from('worker_attendance')
      .select('id, worker_id, client_id, started_at')
      .eq('status', 'open')
      .lt('started_at', cutoff)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    let sent = 0
    for (const row of rows ?? []) {
      const r = row as { worker_id: string; client_id: string; started_at: string }
      await notifyWorkerOpenShiftReminderPush(admin, r.worker_id, r.client_id, r.started_at)
      sent++
    }

    logger.info('CRON', 'attendance-open-shift-reminder', { sent })
    return NextResponse.json({ ok: true, reminders: sent })
  } catch (e) {
    logger.error('CRON', 'attendance-open-shift-reminder failed', e instanceof Error ? e : new Error(String(e)))
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
