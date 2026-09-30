'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { queryKeys } from '@/lib/query-keys'
import { useTenantClientId } from '@/lib/hooks/use-tenant-client-id'

export type SiteTourRow = {
  id: string
  completed_at: string
  notes: string | null
  defect_ticket_id: string | null
  project_name: string
  project_address: string | null
  worker_name: string
  photos?: { public_url: string; mime_type: string | null }[]
}

export async function fetchSiteTours(): Promise<SiteTourRow[]> {
  const res = await fetchWithTimeout('/api/site-tours')
  if (!res.ok) throw new Error('טעינת סיורים נכשלה')
  const json = (await res.json()) as { tours?: SiteTourRow[] }
  return json.tours || []
}

export function useSiteTours(options?: { enabled?: boolean }) {
  const queryClient = useQueryClient()
  const clientIdQuery = useTenantClientId({ enabled: options?.enabled !== false })
  const clientId = clientIdQuery.data

  const toursQuery = useQuery({
    queryKey: clientId ? queryKeys.siteTours(clientId) : ['site-tours', 'pending'],
    queryFn: fetchSiteTours,
    enabled: Boolean(clientId) && options?.enabled !== false,
    staleTime: 60_000,
  })

  return {
    clientId: clientId ?? null,
    tours: toursQuery.data ?? [],
    isLoading: clientIdQuery.isLoading || (toursQuery.isLoading && !toursQuery.data),
    isFetching: toursQuery.isFetching,
    error: clientIdQuery.error || toursQuery.error,
    refetch: toursQuery.refetch,
    invalidate: () =>
      clientId
        ? queryClient.invalidateQueries({ queryKey: queryKeys.siteTours(clientId) })
        : toursQuery.refetch(),
    hasData: Boolean(toursQuery.data) || toursQuery.isSuccess,
  }
}
