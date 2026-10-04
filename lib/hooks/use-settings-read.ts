'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { queryKeys } from '@/lib/query-keys'
import { useTenantClientId } from '@/lib/hooks/use-tenant-client-id'

export type SettingsReadRow = {
  id: string
  name?: string | null
  logo_url?: string | null
  whatsapp_business_phone?: string | null
  manager_phone?: string | null
  default_worker_phone?: string | null
  sms_on_ticket_open?: boolean | null
  sms_on_ticket_close?: boolean | null
  whatsapp_phone_number_id?: string | null
  whatsapp_access_token_set?: boolean
  sms_sender_name?: string | null
  grow_enabled?: boolean | null
  grow_user_id?: string | null
  grow_legal_business_name?: string | null
  grow_legal_phone?: string | null
  grow_legal_address?: string | null
  grow_legal_email?: string | null
  grow_onboarding_status?: string | null
  grow_onboarding_url?: string | null
  grow_onboarding_phone?: string | null
  grow_business_number?: string | null
  grow_onboarding_started_at?: string | null
  grow_onboarding_completed_at?: string | null
  grow_package_name?: string | null
  grow_encrypted_lead?: string | null
  error?: string
}

export async function fetchSettingsRead(): Promise<SettingsReadRow> {
  const res = await fetchWithTimeout('/api/settings/read', {}, 20_000)
  const row = (await res.json().catch(() => ({}))) as SettingsReadRow
  if (!res.ok) throw new Error(row.error || 'טעינת הגדרות נכשלה')
  if (!row?.id) throw new Error('לא נמצא רשומת לקוח')
  return row
}

/**
 * Cached tenant settings for /settings.
 * staleTime 60s — warm nav should not refetch immediately.
 */
export function useTenantSettingsRead(options?: { enabled?: boolean }) {
  const clientIdQuery = useTenantClientId({ enabled: options?.enabled !== false })
  const clientId = clientIdQuery.data
  const queryClient = useQueryClient()

  const q = useQuery({
    queryKey: clientId ? queryKeys.settings(clientId) : ['settings', 'pending'],
    queryFn: fetchSettingsRead,
    enabled: Boolean(clientId) && options?.enabled !== false,
    staleTime: 60_000,
    gcTime: 15 * 60_000,
    retry: 1,
  })

  return {
    clientId: clientId ?? null,
    settings: q.data ?? null,
    isLoading: clientIdQuery.isLoading || (q.isLoading && !q.data),
    isFetching: q.isFetching,
    error: clientIdQuery.error || q.error,
    refetch: q.refetch,
    hasData: Boolean(q.data) || q.isSuccess,
    invalidate: () =>
      clientId
        ? queryClient.invalidateQueries({ queryKey: queryKeys.settings(clientId) })
        : Promise.resolve(),
  }
}
