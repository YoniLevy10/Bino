const STOP = new Set([
  'את',
  'של',
  'על',
  'עם',
  'לא',
  'יש',
  'זה',
  'היא',
  'הוא',
  'גם',
  'או',
  'אם',
  'כל',
  'מה',
  'כי',
  'עוד',
  'כבר',
  'אחרי',
  'לפני',
  'בתוך',
  'מאוד',
  'אין',
  'היה',
  'הייתה',
  'תקלה',
  'בניין',
  'דירה',
])

export type SuggestTicket = {
  id: string
  ticket_number: number | null
  description: string | null
  project_id: string | null
  project_name: string | null
  created_at: string
}

export type MaintenanceSuggestion = {
  title: string
  description: string
  project_id: string
  project_name: string
  priority: 'MEDIUM' | 'HIGH'
  reason: string
  source_ticket_id: string
}

/** Draft a preventive task from tickets already assigned to this worker. */
export function suggestMaintenanceFromTickets(tickets: SuggestTicket[]): MaintenanceSuggestion | null {
  const usable = tickets.filter(
    (t) => t.project_id && (t.description || '').trim().length >= 4
  )
  if (usable.length < 2) return null

  const byProject = new Map<string, SuggestTicket[]>()
  for (const ticket of usable) {
    const projectId = ticket.project_id as string
    const list = byProject.get(projectId) || []
    list.push(ticket)
    byProject.set(projectId, list)
  }

  let best: SuggestTicket[] = []
  for (const list of byProject.values()) {
    if (list.length > best.length) best = list
  }
  if (best.length < 2) return null

  const projectName = best.find((t) => t.project_name)?.project_name || 'הבניין'
  const counts = new Map<string, number>()
  for (const ticket of best) {
    const words = (ticket.description || '')
      .split(/[^\p{L}\p{N}]+/u)
      .map((word) => word.trim())
      .filter((word) => word.length >= 3 && !STOP.has(word))
    for (const word of new Set(words)) {
      counts.set(word, (counts.get(word) || 0) + 1)
    }
  }

  let term = ''
  let termCount = 0
  for (const [word, count] of counts) {
    if (count > termCount) {
      term = word
      termCount = count
    }
  }

  const latest = [...best].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  const title = (
    termCount >= 2 ? `בדיקה מונעת: ${term} — ${projectName}` : `תחזוקה חוזרת — ${projectName}`
  ).slice(0, 200)
  const numbers = best
    .map((ticket) => ticket.ticket_number)
    .filter((n): n is number => typeof n === 'number')
    .slice(0, 5)
  const description = `${best.length} תקלות ששויכו אליך ב${projectName}${
    numbers.length ? ` (#${numbers.join(', #')})` : ''
  }. כדאי לפתוח משימת אחזקה לפני שהתקלה חוזרת.`

  return {
    title,
    description,
    project_id: best[0].project_id as string,
    project_name: projectName,
    priority: best.length >= 3 ? 'HIGH' : 'MEDIUM',
    reason:
      termCount >= 2
        ? `המילה «${term}» חזרה ב-${termCount} תקלות בבניין הזה.`
        : `${best.length} תקלות משויכות באותו בניין.`,
    source_ticket_id: latest.id,
  }
}
