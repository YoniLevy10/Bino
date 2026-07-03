/** Shared ticket shape for detail drawer across dashboard, /tickets, and deep links. */
export type TicketDetailRow = {
  id: string
  ticket_number: number
  project_id?: string | null
  project_code?: string
  project_name?: string
  client_id?: string | null
  reporter_phone?: string | null
  reporter_name?: string | null
  description?: string | null
  status: string
  priority?: string | null
  assigned_worker_id?: string | null
  building_number?: string | null
  created_at?: string
  closed_at?: string | null
}

export type TicketDetailAttachment = {
  id: string
  ticket_id: string
  file_name: string | null
  file_url: string | null
  mime_type: string | null
  attachment_type?: string | null
  whatsapp_media_id?: string | null
  created_at: string | null
  signed_url?: string | null
}

export type TicketDetailLog = {
  id: string
  ticket_id: string
  action_type: string
  old_value: string | null
  new_value: string | null
  performed_by: string | null
  notes: string | null
  created_at: string
}

export type TicketMergeCandidate = {
  id: string
  ticket_number: number
  description?: string | null
}
