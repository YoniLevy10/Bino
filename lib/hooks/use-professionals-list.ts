'use client'

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { withClientId } from '@/lib/supabase/with-client-id'
import { queryKeys } from '@/lib/query-keys'
import { useTenantClientId } from '@/lib/hooks/use-tenant-client-id'
import type { ProfessionalOption } from '@/app/components/tickets/ForwardToProfessionalBlock'

export const PROFESSIONALS_PAGE_SIZE = 100
/** Shared assign/forward list size (Dashboard + Tickets drawer). */
export const ACTIVE_PROFESSIONALS_ASSIGN_LIMIT = 200

/** List columns — includes operational memory fields for system-wide ranking. */
export const PROFESSIONALS_LIST_SELECT =
  'id, full_name, phone, extra_phones, trade, company_name, email, notes, personal_rating, personal_note, use_count, last_contacted_at, is_active'

export type ProfessionalListRow = {
  id: string
  full_name: string
  phone: string | null
  extra_phones?: string[] | null
  trade?: string | null
  company_name?: string | null
  email?: string | null
  notes?: string | null
  personal_rating?: number | null
  personal_note?: string | null
  use_count?: number | null
  last_contacted_at?: string | null
  is_active: boolean
}

export function isProfessionalsTableMissing(err: { message?: string } | null): boolean {
  if (!err?.message) return false
  const m = err.message.toLowerCase()
  return m.includes('professionals') && (m.includes('does not exist') || m.includes('schema cache'))
}

/** Rank: rating DESC → use_count DESC → last_contacted DESC → name. */
export function compareProfessionalsByOperationalMemory(
  a: {
    personal_rating?: number | null
    use_count?: number | null
    last_contacted_at?: string | null
    full_name: string
  },
  b: {
    personal_rating?: number | null
    use_count?: number | null
    last_contacted_at?: string | null
    full_name: string
  }
): number {
  const ar = a.personal_rating ?? 0
  const br = b.personal_rating ?? 0
  if (br !== ar) return br - ar
  const au = a.use_count ?? 0
  const bu = b.use_count ?? 0
  if (bu !== au) return bu - au
  const at = a.last_contacted_at ? Date.parse(a.last_contacted_at) : 0
  const bt = b.last_contacted_at ? Date.parse(b.last_contacted_at) : 0
  if (bt !== at) return bt - at
  return a.full_name.localeCompare(b.full_name, 'he')
}

export async function fetchProfessionalsPage(
  clientId: string,
  opts?: { offset?: number; limit?: number }
): Promise<{ rows: ProfessionalListRow[]; hasMore: boolean }> {
  const offset = opts?.offset ?? 0
  const limit = opts?.limit ?? PROFESSIONALS_PAGE_SIZE
  const { data, error } = await withClientId(
    supabase.from('professionals').select(PROFESSIONALS_LIST_SELECT),
    clientId
  )
    .is('deleted_at', null)
    .order('personal_rating', { ascending: false, nullsFirst: false })
    .order('use_count', { ascending: false })
    .order('last_contacted_at', { ascending: false, nullsFirst: false })
    .order('full_name', { ascending: true })
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error) {
    // Fallback if columns not yet migrated — keep product usable.
    if (/personal_rating|use_count|last_contacted|personal_note/i.test(error.message)) {
      const legacy = await withClientId(
        supabase
          .from('professionals')
          .select('id, full_name, phone, extra_phones, trade, company_name, email, notes, is_active'),
        clientId
      )
        .is('deleted_at', null)
        .order('full_name', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + limit - 1)
      if (legacy.error) throw legacy.error
      const rows = (legacy.data || []) as ProfessionalListRow[]
      return { rows, hasMore: rows.length >= limit }
    }
    throw error
  }
  const rows = ((data || []) as ProfessionalListRow[]).slice().sort(compareProfessionalsByOperationalMemory)
  return { rows, hasMore: rows.length >= limit }
}

export function useTenantProfessionalsList(options?: { enabled?: boolean; limit?: number }) {
  const clientIdQuery = useTenantClientId({ enabled: options?.enabled !== false })
  const clientId = clientIdQuery.data
  const limit = options?.limit ?? PROFESSIONALS_PAGE_SIZE

  const q = useQuery({
    queryKey: clientId
      ? queryKeys.professionals(clientId, limit)
      : ['professionals', 'pending', limit],
    queryFn: () => fetchProfessionalsPage(clientId!, { offset: 0, limit }),
    enabled: Boolean(clientId) && options?.enabled !== false,
    staleTime: 60_000,
  })

  return {
    clientId: clientId ?? null,
    professionals: q.data?.rows ?? [],
    hasMore: q.data?.hasMore ?? false,
    isLoading: clientIdQuery.isLoading || (q.isLoading && !q.data),
    isFetching: q.isFetching,
    error: clientIdQuery.error || q.error,
    refetch: q.refetch,
    hasData: Boolean(q.data) || q.isSuccess,
  }
}

/** Active professionals for ticket assign UI — one RQ key shared across manager screens. */
export async function fetchActiveProfessionalsForAssign(
  clientId: string
): Promise<ProfessionalOption[]> {
  const select =
    'id, full_name, phone, trade, is_active, personal_rating, personal_note, use_count, last_contacted_at'
  const { data, error } = await withClientId(
    supabase.from('professionals').select(select),
    clientId
  )
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('personal_rating', { ascending: false, nullsFirst: false })
    .order('use_count', { ascending: false })
    .order('full_name', { ascending: true })
    .limit(ACTIVE_PROFESSIONALS_ASSIGN_LIMIT)

  if (error) {
    if (/personal_rating|use_count|last_contacted|personal_note/i.test(error.message)) {
      const legacy = await withClientId(
        supabase.from('professionals').select('id, full_name, phone, trade, is_active'),
        clientId
      )
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('full_name', { ascending: true })
        .limit(ACTIVE_PROFESSIONALS_ASSIGN_LIMIT)
      if (legacy.error) throw legacy.error
      return (legacy.data || []) as ProfessionalOption[]
    }
    throw error
  }
  return ((data || []) as ProfessionalOption[])
    .slice()
    .sort(compareProfessionalsByOperationalMemory)
}

export function useActiveProfessionalsForAssign(options?: { enabled?: boolean }) {
  const clientIdQuery = useTenantClientId({ enabled: options?.enabled !== false })
  const clientId = clientIdQuery.data

  const q = useQuery({
    queryKey: clientId
      ? queryKeys.professionalsActiveAssign(clientId)
      : ['professionals', 'pending', 'active-assign'],
    queryFn: () => fetchActiveProfessionalsForAssign(clientId!),
    enabled: Boolean(clientId) && options?.enabled !== false,
    staleTime: 60_000,
  })

  return {
    clientId: clientId ?? null,
    professionals: q.data ?? [],
    isLoading: clientIdQuery.isLoading || (q.isLoading && !q.data),
    isFetching: q.isFetching,
    error: clientIdQuery.error || q.error,
    refetch: q.refetch,
    ensureLoaded: () => q.refetch(),
    hasData: Boolean(q.data) || q.isSuccess,
  }
}
