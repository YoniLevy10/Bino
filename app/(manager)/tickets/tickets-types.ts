export type TicketRow = {
  id: string
  ticket_number: number
  client_id?: string | null
  project_id?: string | null
  project_code?: string
  project_name?: string
  reporter_phone?: string | null
  reporter_name?: string | null
  description?: string | null
  status: string
  priority?: string | null
  assigned_worker_id?: string | null
  building_number?: string | null
  created_at?: string
  closed_at?: string | null
  projects?:
    | { name?: string | null; project_code?: string | null }[]
    | { name?: string | null; project_code?: string | null }
    | null
}

export type AttachmentRow = {
  id: string
  ticket_id: string
  file_name: string | null
  file_url: string | null
  mime_type: string | null
  attachment_type: string
  whatsapp_media_id: string | null
  created_at: string | null
  signed_url?: string | null
}

export type WorkerRow = {
  id: string
  full_name: string
  phone?: string | null
  email?: string | null
  role?: string | null
  is_active?: boolean | null
}

export type ProjectRow = {
  id: string
  name: string
  project_code: string
}
