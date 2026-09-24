'use client'

import { useQuery } from '@tanstack/react-query'
import { resolveBinoClientIdForBrowser } from '@/lib/bamakor-client'
import { supabase } from '@/lib/supabase'
import { withClientId } from '@/lib/supabase/with-client-id'
import { queryKeys } from '@/lib/query-keys'

export type ProjectListRow = {
  id: string
  name: string
  project_code?: string | null
  address?: string | null
  address_en?: string | null
  qr_identifier?: string | null
  is_active?: boolean | null
  created_at?: string | null
  client_id?: string | null
  assigned_worker_id?: string | null
  manager_phone?: string | null
}

const PROJECTS_LIST_SELECT =
  'id, name, project_code, address, address_en, qr_identifier, is_active, created_at, client_id, assigned_worker_id'

export async function fetchProjectsList(clientId: string): Promise<ProjectListRow[]> {
  const { data, error } = await withClientId(
    supabase.from('projects').select(PROJECTS_LIST_SELECT),
    clientId
  ).order('project_code', { ascending: true })
  if (error) throw error
  return (data || []) as ProjectListRow[]
}

/** Resolves clientId then caches projects under the real tenant key. */
export function useTenantProjectsList(options?: { enabled?: boolean; activeOnly?: boolean }) {
  const clientIdQuery = useQuery({
    queryKey: ['tenant-client-id'],
    queryFn: () => resolveBinoClientIdForBrowser(),
    staleTime: 5 * 60_000,
    enabled: options?.enabled !== false,
  })

  const clientId = clientIdQuery.data

  const projectsQuery = useQuery({
    queryKey: clientId ? queryKeys.projects(clientId) : ['projects', 'pending'],
    queryFn: () => fetchProjectsList(clientId!),
    enabled: Boolean(clientId) && options?.enabled !== false,
    staleTime: 60_000,
  })

  const rows = projectsQuery.data
  const filtered =
    options?.activeOnly && rows ? rows.filter((p) => p.is_active !== false) : rows

  return {
    clientId: clientId ?? null,
    projects: filtered ?? [],
    isLoading: clientIdQuery.isLoading || (projectsQuery.isLoading && !projectsQuery.data),
    isFetching: projectsQuery.isFetching,
    error: clientIdQuery.error || projectsQuery.error,
    refetch: projectsQuery.refetch,
    hasData: Boolean(projectsQuery.data) || projectsQuery.isSuccess,
  }
}
