import type { SupabaseClient } from '@supabase/supabase-js'
import { getIsraelDayBounds } from '@/lib/maintenance-task-day'
import { buildDedupeKey } from '../dedupe'
import type { RecommendationDraft } from '../types'

/** Overdue = due_at is before the start of "today" in Asia/Jerusalem, or earlier today past due instant. */
export function isMaintenanceTaskOverdue(opts: {
  dueAt: string | null | undefined
  status: string
  now?: Date
}): boolean {
  if (opts.status === 'DONE') return false
  if (!opts.dueAt) return false
  const now = opts.now ?? new Date()
  return new Date(opts.dueAt).getTime() < now.getTime()
}

export async function detectMaintenanceOverdue(
  admin: SupabaseClient,
  clientId: string
): Promise<RecommendationDraft[]> {
  const now = new Date()
  const { startIso } = getIsraelDayBounds(now)

  // Fetch open tasks with a due date at or before end of today window; filter overdue in JS
  const { data: tasks, error } = await admin
    .from('maintenance_tasks')
    .select(
      'id, title, due_at, status, project_id, assigned_worker_id, projects(name), workers:assigned_worker_id(full_name)'
    )
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .neq('status', 'DONE')
    .not('due_at', 'is', null)
    .lte('due_at', now.toISOString())
    .limit(100)

  if (error || !tasks?.length) return []

  const drafts: RecommendationDraft[] = []

  for (const task of tasks) {
    if (!isMaintenanceTaskOverdue({ dueAt: task.due_at as string, status: task.status as string, now })) {
      continue
    }

    const project = Array.isArray(task.projects) ? task.projects[0] : task.projects
    const worker = Array.isArray(task.workers) ? task.workers[0] : task.workers
    const projectName = (project as { name?: string } | null)?.name?.trim() || 'ללא בניין'
    const workerName = (worker as { full_name?: string } | null)?.full_name?.trim()
    const title = (task.title as string) || 'משימה'
    const dueAt = task.due_at as string
    const hasWorker = !!(task.assigned_worker_id as string | null)

    const reason = `המשימה '${title}' עברה את מועד הביצוע ועדיין לא סומנה כהושלמה.`

    const actions = [
      {
        id: 'open_task',
        label: 'פתיחת המשימה',
        href: `/tasks?task=${task.id}`,
        kind: 'navigate' as const,
      },
      {
        id: 'update_due',
        label: 'עדכון מועד',
        href: `/tasks?task=${task.id}&focus=due`,
        kind: 'navigate' as const,
      },
      { id: 'snooze', label: 'הזכר לי מאוחר יותר', kind: 'snooze' as const },
    ]
    if (!hasWorker) {
      actions.splice(1, 0, {
        id: 'assign_worker',
        label: 'שיבוץ עובד',
        href: `/tasks?task=${task.id}&focus=assign`,
        kind: 'navigate',
      })
    }

    drafts.push({
      recommendationType: 'maintenance_overdue',
      entityType: 'maintenance_task',
      entityId: task.id as string,
      dedupeKey: buildDedupeKey('maintenance_overdue', task.id as string),
      urgency: new Date(dueAt).getTime() < new Date(startIso).getTime() - 86_400_000 ? 'high' : 'medium',
      reason,
      facts: {
        title,
        project_id: task.project_id,
        project_name: projectName,
        due_at: dueAt,
        assigned_worker_id: task.assigned_worker_id,
        assigned_worker_name: workerName || null,
        has_assignee: hasWorker,
        assignee_label: hasWorker ? workerName || 'עובד לא ידוע' : 'אין עובד אחראי',
      },
      primaryAction: 'open_task',
      primaryActionHref: `/tasks?task=${task.id}`,
      actions,
    })
  }

  return drafts
}
