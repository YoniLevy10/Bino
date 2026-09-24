'use client'

import { useQuery } from '@tanstack/react-query'
import { resolveBinoClientIdForBrowser } from '@/lib/bamakor-client'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { queryKeys } from '@/lib/query-keys'

export type AttendanceDashboardPayload = {
  events?: unknown[]
  kpis?: {
    active_workers_now: number
    clock_ins_today: number
    pending_review: number
  }
  today_summary?: unknown
  anomalies?: unknown
  shifts?: unknown[]
}

export async function fetchAttendanceDashboard(params: {
  from: string
  to: string
  limit?: string
  sync_status?: string
}): Promise<AttendanceDashboardPayload> {
  const qs = new URLSearchParams({
    from: params.from,
    to: params.to,
    limit: params.limit ?? '500',
  })
  if (params.sync_status) qs.set('sync_status', params.sync_status)
  const res = await fetchWithTimeout(`/api/attendance/dashboard?${qs.toString()}`)
  const body = (await res.json().catch(() => ({}))) as AttendanceDashboardPayload & {
    error?: string
  }
  if (!res.ok) throw new Error(body.error || 'טעינה נכשלה')
  return body
}

export function useAttendanceDashboard(opts: {
  from: string
  to: string
  syncFilter?: string
  enabled?: boolean
}) {
  const clientIdQuery = useQuery({
    queryKey: ['tenant-client-id'],
    queryFn: () => resolveBinoClientIdForBrowser(),
    staleTime: 5 * 60_000,
    enabled: opts.enabled !== false,
  })
  const clientId = clientIdQuery.data
  const sync = opts.syncFilter || ''

  const dashboardQuery = useQuery({
    queryKey: clientId
      ? [...queryKeys.attendanceDashboard(clientId, opts.from, opts.to), sync]
      : ['attendance-dashboard', 'pending'],
    queryFn: () =>
      fetchAttendanceDashboard({
        from: opts.from,
        to: opts.to,
        sync_status: sync || undefined,
      }),
    enabled: Boolean(clientId) && opts.enabled !== false,
    staleTime: 30_000,
  })

  return {
    clientId: clientId ?? null,
    data: dashboardQuery.data,
    isLoading: clientIdQuery.isLoading || (dashboardQuery.isLoading && !dashboardQuery.data),
    isFetching: dashboardQuery.isFetching,
    error: clientIdQuery.error || dashboardQuery.error,
    refetch: dashboardQuery.refetch,
    hasData: Boolean(dashboardQuery.data) || dashboardQuery.isSuccess,
  }
}
