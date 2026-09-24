'use client'

import { useQuery } from '@tanstack/react-query'
import { resolveBinoClientIdForBrowser } from '@/lib/bamakor-client'
import { supabase } from '@/lib/supabase'
import { withClientId } from '@/lib/supabase/with-client-id'
import { queryKeys } from '@/lib/query-keys'

export type WorkerListRow = {
  id: string
  full_name: string
  phone?: string | null
  email?: string | null
  role?: string | null
  is_active?: boolean | null
  hourly_rate?: number | null
  created_at?: string | null
  client_id?: string | null
  notify_sms?: boolean | null
  notify_whatsapp?: boolean | null
  notify_push?: boolean | null
  can_mark_professional_escort?: boolean | null
  extra_phones?: string[] | null
}

/** List UI columns — intentionally omits access_token. */
export const WORKERS_LIST_SELECT =
  'id, full_name, phone, extra_phones, email, role, is_active, hourly_rate, created_at, client_id, notify_sms, notify_whatsapp, notify_push, can_mark_professional_escort'

export async function fetchWorkersList(
  clientId: string,
  opts?: { activeOnly?: boolean }
): Promise<WorkerListRow[]> {
  let q = withClientId(supabase.from('workers').select(WORKERS_LIST_SELECT), clientId).is(
    'deleted_at',
    null
  )
  if (opts?.activeOnly) q = q.eq('is_active', true)
  const { data, error } = await q.order('full_name', { ascending: true })
  if (error) throw error
  return (data || []) as WorkerListRow[]
}

export function useTenantWorkersList(options?: { enabled?: boolean; activeOnly?: boolean }) {
  const clientIdQuery = useQuery({
    queryKey: ['tenant-client-id'],
    queryFn: () => resolveBinoClientIdForBrowser(),
    staleTime: 5 * 60_000,
    enabled: options?.enabled !== false,
  })

  const clientId = clientIdQuery.data
  const key = clientId
    ? options?.activeOnly
      ? queryKeys.workersActive(clientId)
      : queryKeys.workers(clientId)
    : (['workers', 'pending'] as const)

  const workersQuery = useQuery({
    queryKey: key,
    queryFn: () => fetchWorkersList(clientId!, { activeOnly: options?.activeOnly }),
    enabled: Boolean(clientId) && options?.enabled !== false,
    staleTime: 60_000,
  })

  return {
    clientId: clientId ?? null,
    workers: workersQuery.data ?? [],
    isLoading: clientIdQuery.isLoading || workersQuery.isLoading,
    isFetching: workersQuery.isFetching,
    error: clientIdQuery.error || workersQuery.error,
    refetch: workersQuery.refetch,
    hasData: (workersQuery.data?.length ?? 0) > 0 || workersQuery.isSuccess,
  }
}
