/**
 * Proposed BINO ↔ Fixly API contract (v1).
 * BINO owns tickets; Fixly broadcasts open service calls for pros to claim.
 */

export const FIXLY_JOB_STATUSES = [
  'open',
  'claimed',
  'assigned',
  'en_route',
  'arrived',
  'in_progress',
  'completed',
  'cancelled',
  'expired',
] as const

export type FixlyJobStatus = (typeof FIXLY_JOB_STATUSES)[number]

export type FixlyCreateJobRequest = {
  bino_ticket_id: string
  bino_ticket_number: number
  client_id: string
  project_id: string
  trade: string
  description: string
  priority: string
  address: string
  building_name?: string | null
  building_number?: string | null
  contact_name?: string | null
  contact_phone?: string | null
  media_urls?: string[]
}

export type FixlyCreateJobResponse = {
  fixly_job_id: string
  status: FixlyJobStatus
}

export type FixlyWebhookEvent = {
  event_id?: string
  fixly_job_id: string
  bino_ticket_id: string
  status: FixlyJobStatus
  professional_name?: string | null
  professional_phone?: string | null
  note?: string | null
  occurred_at?: string | null
}

export type TicketFixlyMetadata = {
  job_id: string
  launched_at: string
  last_status: FixlyJobStatus
  trade?: string
  last_event_id?: string | null
  professional_name?: string | null
  professional_phone?: string | null
}
