import { matchTicketTopic } from '@/lib/recommendations/topic-keywords'

export type SuggestWorkerTicket = {
  id: string
  project_id: string | null
  description: string | null
  assigned_worker_id: string | null
  status: string
  created_at?: string | null
  closed_at?: string | null
}

export type SuggestWorkerCandidate = {
  id: string
  full_name: string
  is_active?: boolean | null
}

export type SuggestWorkerInput = {
  ticket: SuggestWorkerTicket
  /** Recent tickets for the same client (caller should bound + filter by project when possible). */
  history: SuggestWorkerTicket[]
  workers: SuggestWorkerCandidate[]
  /** Optional default worker on the project. */
  projectDefaultWorkerId?: string | null
}

export type SuggestWorkerResult = {
  workerId: string
  workerName: string
  reasonHe: string
  score: number
  source: 'topic_history' | 'building_history' | 'project_default'
}

type ScoreRow = { workerId: string; score: number; topicHits: number; buildingHits: number }

/**
 * Rule-based worker suggestion from building + topic history (no LLM).
 * Prefers workers who closed/handled same-topic tickets in the building; else building
 * history; else project default worker. Never auto-assigns — caller must confirm.
 */
export function suggestWorkerForTicket(input: SuggestWorkerInput): SuggestWorkerResult | null {
  const { ticket, history, workers, projectDefaultWorkerId } = input
  if (!ticket.project_id) return null

  const active = workers.filter((w) => w.is_active !== false)
  const byId = new Map(active.map((w) => [w.id, w]))
  if (byId.size === 0) return null

  // Already assigned → no suggestion needed for assign CTA
  if (ticket.assigned_worker_id && byId.has(ticket.assigned_worker_id)) {
    return null
  }

  const topic = matchTicketTopic(ticket.description)
  const scores = new Map<string, ScoreRow>()

  for (const h of history) {
    if (h.id === ticket.id) continue
    if (h.project_id !== ticket.project_id) continue
    if (!h.assigned_worker_id || !byId.has(h.assigned_worker_id)) continue
    if (h.status === 'CLOSED' || h.assigned_worker_id) {
      const cur = scores.get(h.assigned_worker_id) || {
        workerId: h.assigned_worker_id,
        score: 0,
        topicHits: 0,
        buildingHits: 0,
      }
      cur.buildingHits += 1
      cur.score += 1
      if (topic) {
        const hTopic = matchTicketTopic(h.description)
        if (hTopic?.topicKey === topic.topicKey) {
          cur.topicHits += 1
          cur.score += 3
        }
      }
      scores.set(h.assigned_worker_id, cur)
    }
  }

  const ranked = [...scores.values()].sort((a, b) => b.score - a.score || b.topicHits - a.topicHits)
  const best = ranked[0]

  if (best && best.score > 0) {
    const worker = byId.get(best.workerId)!
    if (best.topicHits > 0 && topic) {
      return {
        workerId: worker.id,
        workerName: worker.full_name,
        reasonHe: `טיפל ב-${best.topicHits} תקלות דומות בנושא ${topic.labelHe} בבניין זה`,
        score: best.score,
        source: 'topic_history',
      }
    }
    return {
      workerId: worker.id,
      workerName: worker.full_name,
      reasonHe: `טיפל ב-${best.buildingHits} תקלות בבניין זה לאחרונה`,
      score: best.score,
      source: 'building_history',
    }
  }

  const defaultId = projectDefaultWorkerId?.trim()
  if (defaultId && byId.has(defaultId)) {
    const worker = byId.get(defaultId)!
    return {
      workerId: worker.id,
      workerName: worker.full_name,
      reasonHe: 'עובד ברירת מחדל של הבניין',
      score: 0.5,
      source: 'project_default',
    }
  }

  return null
}
