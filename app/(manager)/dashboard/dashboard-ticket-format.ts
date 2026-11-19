import type { OpenTicketRow } from '@/lib/hooks/use-open-tickets'
import type { TicketDetailRow } from '@/lib/tickets/ticket-detail-types'

export type TicketRow = {
  id: string
  ticket_number: number
  project_id?: string
  project_code?: string
  project_name?: string
  client_id?: string | null
  reporter_phone: string
  reporter_name?: string | null
  description: string
  status: string
  priority?: string
  assigned_worker_id: string | null
  created_at: string
  closed_at: string | null
}

export function mapFetchedTicketRow(fetched: TicketDetailRow): TicketRow {
  return {
    id: fetched.id,
    ticket_number: fetched.ticket_number,
    project_id: fetched.project_id ?? undefined,
    project_code: fetched.project_code,
    project_name: fetched.project_name,
    client_id: fetched.client_id ?? null,
    reporter_phone: fetched.reporter_phone || '',
    reporter_name: fetched.reporter_name,
    description: fetched.description || '',
    status: fetched.status,
    priority: fetched.priority ?? undefined,
    assigned_worker_id: fetched.assigned_worker_id ?? null,
    created_at: fetched.created_at || '',
    closed_at: fetched.closed_at ?? null,
  }
}

export function formatOpenTicketsForDashboard(rows: OpenTicketRow[]): TicketRow[] {
  return rows.map((row) => {
    const project = Array.isArray(row.projects) ? row.projects[0] : row.projects
    return {
      id: row.id,
      ticket_number: Number(row.ticket_number),
      project_id: row.project_id ?? undefined,
      client_id: row.client_id ?? null,
      project_code: project?.project_code || '',
      project_name: project?.name || '',
      reporter_phone: row.reporter_phone || '',
      reporter_name: row.reporter_name,
      description: row.description || '',
      status: row.status,
      priority: row.priority ?? undefined,
      assigned_worker_id: row.assigned_worker_id ?? null,
      created_at: row.created_at || '',
      closed_at: row.closed_at ?? null,
    }
  })
}
