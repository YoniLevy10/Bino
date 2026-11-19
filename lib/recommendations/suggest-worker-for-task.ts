import {
  suggestWorkerForTicket,
  type SuggestWorkerCandidate,
  type SuggestWorkerResult,
} from '@/lib/recommendations/suggest-worker'

export type MaintenanceHistoryRow = {
  id: string
  project_id: string | null
  title: string | null
  description: string | null
  assigned_worker_id: string | null
  status: string
}

/**
 * Reuse ticket suggestion engine with task title/description as the «ticket» text.
 */
export function suggestWorkerForMaintenanceTask(input: {
  projectId: string | null
  title: string
  description?: string | null
  assignedWorkerId?: string | null
  history: MaintenanceHistoryRow[]
  workers: SuggestWorkerCandidate[]
  projectDefaultWorkerId?: string | null
}): SuggestWorkerResult | null {
  if (!input.projectId) return null
  const description = [input.title, input.description || ''].filter(Boolean).join('\n')
  return suggestWorkerForTicket({
    ticket: {
      id: 'new-task',
      project_id: input.projectId,
      description,
      assigned_worker_id: input.assignedWorkerId || null,
      status: 'PENDING',
    },
    history: input.history.map((h) => ({
      id: h.id,
      project_id: h.project_id,
      description: [h.title, h.description || ''].filter(Boolean).join('\n'),
      assigned_worker_id: h.assigned_worker_id,
      status: h.status === 'DONE' ? 'CLOSED' : h.status,
    })),
    workers: input.workers,
    projectDefaultWorkerId: input.projectDefaultWorkerId,
  })
}
