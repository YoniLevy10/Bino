import type { SummaryTicketRow } from '@/lib/summary-tickets'
import type { TicketDetailRow } from '@/lib/ticket-detail-types'

export function summaryTicketToDetail(row: SummaryTicketRow): TicketDetailRow {
  return {
    id: row.id,
    ticket_number: row.ticket_number,
    project_id: row.project_id,
    project_code: row.project_code,
    project_name: row.project_name,
    reporter_phone: row.reporter_phone,
    reporter_name: row.reporter_name,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assigned_worker_id: row.assigned_worker_id,
    building_number: row.building_number,
    created_at: row.created_at,
    closed_at: row.closed_at,
  }
}

/** Inverse mapper for deep-link fetch → summary list row shape. */
export function ticketDetailToSummaryRow(row: TicketDetailRow): SummaryTicketRow {
  return {
    id: row.id,
    ticket_number: row.ticket_number,
    project_id: row.project_id ?? undefined,
    project_code: row.project_code,
    project_name: row.project_name,
    reporter_phone: row.reporter_phone || '',
    reporter_name: row.reporter_name,
    description: row.description || '',
    status: row.status,
    priority: row.priority ?? undefined,
    assigned_worker_id: row.assigned_worker_id ?? null,
    building_number: row.building_number,
    created_at: row.created_at || '',
    closed_at: row.closed_at ?? null,
  }
}
