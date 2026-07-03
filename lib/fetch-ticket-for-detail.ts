import { withClientId } from '@/lib/supabase/with-client-id'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TicketDetailRow } from '@/lib/ticket-detail-types'

const TICKET_DETAIL_SELECT = `
  id, ticket_number, client_id, project_id, reporter_phone, reporter_name,
  description, status, priority, assigned_worker_id, building_number,
  created_at, closed_at,
  projects (name, project_code)
`.trim()

type RawTicket = TicketDetailRow & {
  projects?:
    | { name?: string | null; project_code?: string | null }
    | { name?: string | null; project_code?: string | null }[]
    | null
}

function normalizeTicketRow(row: RawTicket): TicketDetailRow {
  const project = Array.isArray(row.projects) ? row.projects[0] : row.projects
  return {
    ...row,
    project_code: project?.project_code || '',
    project_name: project?.name || '',
  }
}

/** Load a single ticket for the detail drawer (includes closed tickets). */
export async function fetchTicketForDetail(
  supabase: SupabaseClient,
  clientId: string,
  ticketId: string
): Promise<TicketDetailRow | null> {
  const { data, error } = await withClientId(
    supabase.from('tickets').select(TICKET_DETAIL_SELECT),
    clientId
  )
    .eq('id', ticketId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !data) return null
  return normalizeTicketRow(data as RawTicket)
}
