'use client'

import { useQuery } from '@tanstack/react-query'
import { resolveBinoClientIdForBrowser } from '@/lib/bamakor-client'
import { supabase } from '@/lib/supabase'
import { withClientId } from '@/lib/supabase/with-client-id'
import { queryKeys } from '@/lib/query-keys'

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
  const clientIdQuery = useQuery({
    queryKey: ['tenant-client-id'],
    queryFn: () => resolveBinoClientIdForBrowser(),
    staleTime: 5 * 60_000,
    enabled: options?.enabled !== false,
  })

  const clientId = clientIdQuery.data

  const ticketsQuery = useQuery({
    queryKey: clientId ? queryKeys.ticketsOpen(clientId) : ['tickets-open', 'pending'],
    queryFn: () => fetchOpenTickets(clientId!, options?.limit ?? 200),
    enabled: Boolean(clientId) && options?.enabled !== false,
    staleTime: 30_000,
  })

  return {
    clientId: clientId ?? null,
    tickets: ticketsQuery.data ?? [],
    isLoading: clientIdQuery.isLoading || ticketsQuery.isLoading,
    isFetching: ticketsQuery.isFetching,
    error: clientIdQuery.error || ticketsQuery.error,
    refetch: ticketsQuery.refetch,
    hasData: (ticketsQuery.data?.length ?? 0) > 0 || ticketsQuery.isSuccess,
  }
}
