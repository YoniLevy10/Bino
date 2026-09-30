'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { withClientId } from '@/lib/supabase/with-client-id'
import { queryKeys } from '@/lib/query-keys'
import { useTenantClientId } from '@/lib/hooks/use-tenant-client-id'

/** Shared open-tickets fetch size — one RQ key for dashboard + tickets page. */
export const OPEN_TICKETS_SHARED_LIMIT = 200

export const OPEN_TICKETS_LIST_SELECT = `
  id, ticket_number, client_id, project_id, reporter_phone, reporter_name, description,
  status, priority, assigned_worker_id, building_number, created_at, closed_at,
  projects (name, project_code)
`

export type OpenTicketRow = {
  id: string
  ticket_number: number | string
  client_id?: string | null
  project_id?: string | null
  reporter_phone?: string | null
  reporter_name?: string | null
  description?: string | null
  status: string
  priority?: string | null
  assigned_worker_id?: string | null
  building_number?: string | null
  created_at: string
  closed_at?: string | null
  projects?:
    | { name?: string | null; project_code?: string | null }
    | { name?: string | null; project_code?: string | null }[]
    | null
}

export async function fetchOpenTickets(clientId: string, limit = 200): Promise<OpenTicketRow[]> {
  const { data, error } = await withClientId(
    supabase.from('tickets').select(OPEN_TICKETS_LIST_SELECT),
    clientId
  )
    .is('deleted_at', null)
    .neq('status', 'CLOSED')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data || []) as OpenTicketRow[]
}

export function useTenantOpenTickets(options?: { enabled?: boolean; limit?: number }) {
  const clientIdQuery = useTenantClientId({ enabled: options?.enabled !== false })
  const clientId = clientIdQuery.data

  // Always cache under the shared limit so dashboard ↔ tickets warm-nav hits the same key.
  const limit = OPEN_TICKETS_SHARED_LIMIT
  const displayLimit = options?.limit ?? OPEN_TICKETS_SHARED_LIMIT
  const ticketsQuery = useQuery({
    queryKey: clientId
      ? queryKeys.ticketsOpen(clientId, OPEN_TICKETS_SHARED_LIMIT)
      : ['tickets-open', 'pending', OPEN_TICKETS_SHARED_LIMIT],
    queryFn: () => fetchOpenTickets(clientId!, limit),
    enabled: Boolean(clientId) && options?.enabled !== false,
    staleTime: 30_000,
  })

  const rows = ticketsQuery.data ?? []
  const tickets = displayLimit < rows.length ? rows.slice(0, displayLimit) : rows

  return {
    clientId: clientId ?? null,
    tickets,
    isLoading: clientIdQuery.isLoading || ticketsQuery.isLoading,
    isFetching: ticketsQuery.isFetching,
    error: clientIdQuery.error || ticketsQuery.error,
    refetch: ticketsQuery.refetch,
    hasData: rows.length > 0 || ticketsQuery.isSuccess,
  }
}
