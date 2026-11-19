import type { OpenTicketRow } from '@/lib/hooks/use-open-tickets'
import type { TicketRow, WorkerRow, ProjectRow } from './tickets-types'
import { TICKETS_CACHE_TTL_MS } from './tickets-constants'

export type TicketsCache = {
  tickets: TicketRow[]
  workers: WorkerRow[]
  projects: ProjectRow[]
  ticketsTruncated: boolean
  savedAt: number
}

export function readTicketsCache(clientId: string): TicketsCache | null {
  try {
    const key = `bamakor_tickets_v2_${clientId}`
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as TicketsCache
    if (Date.now() - parsed.savedAt > TICKETS_CACHE_TTL_MS) return null
    return parsed
  } catch { return null }
}

export function writeTicketsCache(clientId: string, data: Omit<TicketsCache, 'savedAt'>) {
  try {
    const key = `bamakor_tickets_v2_${clientId}`
    localStorage.setItem(key, JSON.stringify({ ...data, savedAt: Date.now() }))
  } catch { /* storage full or unavailable */ }
}

export function normalizeOpenTicketRows(rows: OpenTicketRow[]): TicketRow[] {
  return rows.map((ticket) => {
    const project = Array.isArray(ticket.projects) ? ticket.projects[0] : ticket.projects
    return {
      id: ticket.id,
      ticket_number: Number(ticket.ticket_number),
      client_id: ticket.client_id,
      project_id: ticket.project_id,
      project_code: project?.project_code || '',
      project_name: project?.name || '',
      reporter_phone: ticket.reporter_phone,
      reporter_name: ticket.reporter_name,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      assigned_worker_id: ticket.assigned_worker_id,
      building_number: ticket.building_number,
      created_at: ticket.created_at,
      closed_at: ticket.closed_at,
      projects: ticket.projects,
    }
  })
}

export function ticketRowsToOpenRows(tickets: TicketRow[]): OpenTicketRow[] {
  return tickets.map((t) => ({
    id: t.id,
    ticket_number: t.ticket_number,
    client_id: t.client_id,
    project_id: t.project_id,
    reporter_phone: t.reporter_phone,
    reporter_name: t.reporter_name,
    description: t.description,
    status: t.status,
    priority: t.priority,
    assigned_worker_id: t.assigned_worker_id,
    building_number: t.building_number,
    created_at: t.created_at || '',
    closed_at: t.closed_at,
    projects: t.projects ?? { name: t.project_name, project_code: t.project_code },
  }))
}
