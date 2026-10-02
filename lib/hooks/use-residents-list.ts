'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { withClientId } from '@/lib/supabase/with-client-id'
import { queryKeys } from '@/lib/query-keys'
import { useTenantClientId } from '@/lib/hooks/use-tenant-client-id'

/** First-page size for warm nav — smaller than legacy 500 for faster paint. */
export const RESIDENTS_PAGE_SIZE = 100

export const RESIDENTS_LIST_SELECT =
  'id, project_id, client_id, full_name, phone, email, is_renter, apartment_number, notes'

export type ResidentListRow = {
  id: string
  project_id: string
  client_id?: string | null
  full_name: string
  phone: string | null
  email?: string | null
  is_renter?: boolean
  apartment_number: string | null
  notes?: string | null
}

export async function fetchResidentsPage(
  clientId: string,
  opts?: { offset?: number; limit?: number }
): Promise<{ rows: ResidentListRow[]; hasMore: boolean }> {
  const offset = opts?.offset ?? 0
  const limit = opts?.limit ?? RESIDENTS_PAGE_SIZE
  const { data, error } = await withClientId(
    supabase.from('residents').select(RESIDENTS_LIST_SELECT),
    clientId
  )
    .is('deleted_at', null)
    // Stable order for pagination (audit #45)
    .order('full_name', { ascending: true })
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) throw error
  const rows = (data || []) as ResidentListRow[]
  return { rows, hasMore: rows.length >= limit }
}

/** First page only — used for warm nav / shared RQ cache. */
export function useTenantResidentsList(options?: { enabled?: boolean; limit?: number }) {
  const clientIdQuery = useTenantClientId({ enabled: options?.enabled !== false })
  const clientId = clientIdQuery.data
  const limit = options?.limit ?? RESIDENTS_PAGE_SIZE

  const residentsQuery = useQuery({
    queryKey: clientId ? queryKeys.residents(clientId, limit) : ['residents', 'pending', limit],
    queryFn: async () => {
      const page = await fetchResidentsPage(clientId!, { offset: 0, limit })
      return page
    },
    enabled: Boolean(clientId) && options?.enabled !== false,
    staleTime: 60_000,
  })

  const page = residentsQuery.data

  return {
    clientId: clientId ?? null,
    residents: page?.rows ?? [],
    hasMore: page?.hasMore ?? false,
    isLoading: clientIdQuery.isLoading || (residentsQuery.isLoading && !residentsQuery.data),
    isFetching: residentsQuery.isFetching,
    error: clientIdQuery.error || residentsQuery.error,
    refetch: residentsQuery.refetch,
    hasData: Boolean(residentsQuery.data) || residentsQuery.isSuccess,
  }
}
