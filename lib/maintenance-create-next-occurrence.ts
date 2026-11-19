import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeMaintenanceCadence } from '@/lib/maintenance-cadence'
import { normalizeChecklistItems } from '@/lib/maintenance-checklist'
import { nextDueAfter } from '@/lib/maintenance-next-due'
import { syncMaintenanceTaskToCalendar } from '@/lib/maintenance-task-calendar-sync'

export type SourceTaskForNext = {
  id: string
  title: string
  description?: string | null
  project_id?: string | null
  assigned_worker_id?: string | null
  priority?: string | null
  notes?: string | null
  cadence?: string | null
  due_at?: string | null
  series_id?: string | null
  checklist_items?: unknown
  asset_id?: string | null
  estimated_minutes?: number | null
}

/**
 * Create the next recurring occurrence from a completed (or source) task.
 */
export async function createNextMaintenanceOccurrence(
  admin: SupabaseClient,
  opts: {
    clientId: string
    userId: string
    source: SourceTaskForNext
  }
): Promise<{ ok: true; taskId: string } | { ok: false; error: string }> {
  const cadence = normalizeMaintenanceCadence(opts.source.cadence)
  if (cadence === 'one_off') {
    return { ok: false, error: 'משימה חד־פעמית — אין מופע הבא' }
  }

  const seriesId = opts.source.series_id || opts.source.id
  const nextDue = nextDueAfter(opts.source.due_at, cadence)
  const checklist = normalizeChecklistItems(opts.source.checklist_items).map((it) => ({
    ...it,
    done_at: null,
  }))

  const { data, error } = await admin
    .from('maintenance_tasks')
    .insert({
      client_id: opts.clientId,
      title: opts.source.title,
      description: opts.source.description || null,
      project_id: opts.source.project_id || null,
      assigned_worker_id: opts.source.assigned_worker_id || null,
      priority: opts.source.priority || 'MEDIUM',
      notes: opts.source.notes || null,
      cadence,
      due_at: nextDue,
      series_id: seriesId,
      checklist_items: checklist,
      asset_id: opts.source.asset_id || null,
      estimated_minutes: opts.source.estimated_minutes ?? null,
      created_by: opts.userId,
      status: 'PENDING',
    })
    .select('id')
    .single()

  if (error || !data?.id) {
    return { ok: false, error: error?.message || 'יצירת מופע נכשלה' }
  }

  // Ensure parent series_id is set on the source row
  if (!opts.source.series_id) {
    await admin
      .from('maintenance_tasks')
      .update({ series_id: seriesId, updated_at: new Date().toISOString() })
      .eq('id', opts.source.id)
      .eq('client_id', opts.clientId)
  }

  await syncMaintenanceTaskToCalendar(admin, {
    clientId: opts.clientId,
    userId: opts.userId,
    taskId: data.id as string,
    title: opts.source.title,
    dueAt: nextDue,
    cadence,
    projectId: opts.source.project_id || null,
    calendarEventId: null,
    status: 'PENDING',
  })

  return { ok: true, taskId: data.id as string }
}
