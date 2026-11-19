/**
 * Remind assigned workers about maintenance tasks due within ~24h.
 * Gated by MAINTENANCE_DUE_REMINDERS_ENABLED=true.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { verifyCronRequest } from '@/lib/cron-auth'
import { notifyWorkerMaintenanceTaskAssigned } from '@/lib/notify/notify-worker-maintenance-task'
import { getLogger } from '@/lib/shared/logging'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const logger = getLogger()
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if ((process.env.MAINTENANCE_DUE_REMINDERS_ENABLED || '').trim() !== 'true') {
    return NextResponse.json({ ok: true, skipped: true, reason: 'disabled' })
  }

  const admin = getSupabaseAdmin()
  const now = new Date()
  const from = now.toISOString()
  const to = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()

  const { data: tasks, error } = await admin
    .from('maintenance_tasks')
    .select('id, client_id, title, assigned_worker_id, due_at')
    .is('deleted_at', null)
    .neq('status', 'DONE')
    .not('assigned_worker_id', 'is', null)
    .gte('due_at', from)
    .lte('due_at', to)
    .limit(100)

  if (error) {
    logger.error('CRON', 'maintenance-due-reminders query failed', new Error(error.message))
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let sent = 0
  for (const t of tasks || []) {
    if (!t.assigned_worker_id || !t.client_id) continue
    try {
      await notifyWorkerMaintenanceTaskAssigned(admin, {
        clientId: t.client_id as string,
        workerId: t.assigned_worker_id as string,
        taskId: t.id as string,
        title: `תזכורת: ${(t.title as string) || 'משימת אחזקה'}`,
        ticketNumber: null,
      })
      sent += 1
    } catch (e) {
      logger.warn('CRON', 'maintenance-due-reminders notify failed', {
        taskId: t.id,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return NextResponse.json({ ok: true, candidates: (tasks || []).length, sent })
}
