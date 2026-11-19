'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchWithTimeout } from '@/lib/shared/fetch-with-timeout'
import { queryKeys } from '@/lib/shared/query-keys'
import { useTenantClientId } from '@/lib/hooks/use-tenant-client-id'

export type SiteTourRow = {
  id: string
  project_id: string
  worker_id: string
  completed_at: string
  notes: string | null
  manager_notes: string | null
  manager_notes_updated_at: string | null
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

async function patchManagerNotes(
  tourId: string,
  managerNotes: string | null
): Promise<{ id: string; manager_notes: string | null; manager_notes_updated_at: string | null }> {
  const res = await fetchWithTimeout(`/api/site-tours/${encodeURIComponent(tourId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ manager_notes: managerNotes }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error || 'שמירת הערת מנהל נכשלה')
  }
  const json = (await res.json()) as {
    tour?: {
      id: string
      manager_notes: string | null
      manager_notes_updated_at: string | null
    }
  }
  if (!json.tour) throw new Error('שמירת הערת מנהל נכשלה')
  return json.tour
}

async function deleteSiteTour(tourId: string): Promise<string> {
  const res = await fetchWithTimeout(`/api/site-tours/${encodeURIComponent(tourId)}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error || 'מחיקת הסיור נכשלה')
  }
  const json = (await res.json().catch(() => null)) as { id?: string } | null
  return json?.id || tourId
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

  const updateNotes = useMutation({
    mutationFn: ({ id, managerNotes }: { id: string; managerNotes: string | null }) =>
      patchManagerNotes(id, managerNotes),
    onSuccess: (tour) => {
      if (!clientId) return
      queryClient.setQueryData<SiteTourRow[]>(queryKeys.siteTours(clientId), (prev) => {
        if (!prev) return prev
        return prev.map((row) =>
          row.id === tour.id
            ? {
                ...row,
                manager_notes: tour.manager_notes,
                manager_notes_updated_at: tour.manager_notes_updated_at,
              }
            : row
        )
      })
    },
  })

  const removeTour = useMutation({
    mutationFn: (id: string) => deleteSiteTour(id),
    onSuccess: (id) => {
      if (!clientId) return
      queryClient.setQueryData<SiteTourRow[]>(queryKeys.siteTours(clientId), (prev) => {
        if (!prev) return prev
        return prev.filter((row) => row.id !== id)
      })
    },
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
    updateManagerNotes: (id: string, managerNotes: string | null) =>
      updateNotes.mutateAsync({ id, managerNotes }),
    isUpdatingNotes: updateNotes.isPending,
    deleteTour: (id: string) => removeTour.mutateAsync(id),
    isDeletingTour: removeTour.isPending,
  }
}
