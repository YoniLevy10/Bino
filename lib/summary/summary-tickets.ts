export const SUMMARY_TICKET_SELECT = `
  id, ticket_number, project_id, reporter_phone, reporter_name, description,
  status, priority, assigned_worker_id, building_number, created_at, closed_at,
  projects (project_code, name)
`

export type SummaryTicketRow = {
  id: string
  ticket_number: number
  project_id?: string
  project_code?: string
  project_name?: string
  reporter_phone: string
  reporter_name?: string | null
  description: string
  status: string
  priority?: string
  assigned_worker_id: string | null
  building_number?: string | null
  created_at: string
  closed_at: string | null
}

type RawProjectJoin =
  | { project_code?: string; name?: string }
  | { project_code?: string; name?: string }[]
  | null
  | undefined

export type RawSummaryTicketRow = {
  id: string
  ticket_number: number
  project_id?: string
  projects?: RawProjectJoin
  reporter_phone: string
  reporter_name?: string | null
  description: string
  status: string
  priority?: string
  assigned_worker_id: string | null
  building_number?: string | null
  created_at: string
  closed_at: string | null
}

function projectField(projects: RawProjectJoin, field: 'project_code' | 'name'): string {
  if (!projects) return ''
  if (Array.isArray(projects)) return projects[0]?.[field] || ''
  return projects[field] || ''
}

export function formatSummaryTicket(row: RawSummaryTicketRow): SummaryTicketRow {
  return {
    id: row.id,
    ticket_number: row.ticket_number,
    project_id: row.project_id,
    project_code: projectField(row.projects, 'project_code'),
    project_name: projectField(row.projects, 'name'),
    reporter_phone: row.reporter_phone,
    reporter_name: row.reporter_name,
    description: row.description,
    building_number: row.building_number,
    status: row.status,
    priority: row.priority,
    assigned_worker_id: row.assigned_worker_id,
    created_at: row.created_at,
    closed_at: row.closed_at,
  }
}

/** PostgREST filter: ticket created or closed within [from, to). ISO values must be quoted. */
export function ticketRangeOrFilter(from: string, to: string): string {
  return `and(created_at.gte."${from}",created_at.lt."${to}"),and(closed_at.gte."${from}",closed_at.lt."${to}")`
}
