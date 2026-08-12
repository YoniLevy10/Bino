import { withClientId } from '@/lib/supabase/with-client-id'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TicketDetailRow } from '@/lib/ticket-detail-types'

const TICKET_DETAIL_SELECT = `
  id, ticket_number, client_id, project_id, reporter_phone, reporter_name,
  description, status, priority, assigned_worker_id, building_number,
  created_at, closed_at,
  fixly_job_id, fixly_status, fixly_provider_name, fixly_provider_phone, fixly_synced_at,
  projects (name, project_code, address, manager_phone)
`.trim()

type RawTicket = TicketDetailRow & {
  projects?:
    | {
        name?: string | null
        project_code?: string | null
        address?: string | null
        manager_phone?: string | null
      }
    | {
        name?: string | null
        project_code?: string | null
        address?: string | null
        manager_phone?: string | null
      }[]
    | null
}

function normalizeTicketRow(row: RawTicket): TicketDetailRow {
  const project = Array.isArray(row.projects) ? row.projects[0] : row.projects
  return {
    ...row,
    project_code: project?.project_code || '',
    project_name: project?.name || '',
    project_address: project?.address || null,
    project_manager_phone: project?.manager_phone || null,
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
