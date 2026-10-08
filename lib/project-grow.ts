import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertTenantCanEnableGrow,
  buildGrowCollectionsAccountStatus,
  isGrowCollectionsConfigured,
  normalizeGrowUserId,
  type ClientGrowPaymentsRow,
  type GrowCollectionsAccountStatus,
} from '@/lib/grow-credentials'
import { isGrowPlatformConfigured } from '@/lib/grow-config'

export type ProjectGrowRow = {
  id: string
  name: string | null
  client_id?: string
  grow_enabled?: boolean | null
  grow_user_id?: string | null
  grow_encrypted_lead?: string | null
  grow_onboarding_url?: string | null
  grow_onboarding_status?: string | null
  grow_onboarding_phone?: string | null
  grow_business_number?: string | null
  grow_onboarding_started_at?: string | null
  grow_onboarding_completed_at?: string | null
  grow_package_name?: string | null
}

export const PROJECT_GROW_SELECT =
  'id, name, client_id, grow_enabled, grow_user_id, grow_encrypted_lead, grow_onboarding_url, grow_onboarding_status, grow_onboarding_phone, grow_business_number, grow_onboarding_started_at, grow_onboarding_completed_at, grow_package_name'

export type GrowMerchantSource = 'project' | 'client'

export type ResolvedGrowMerchant = {
  userId: string
  source: GrowMerchantSource
  projectId: string | null
  enabled: boolean
}

/** Prefer project merchant; fall back to client-level Grow for legacy tenants. */
export function resolveGrowMerchant(opts: {
  project: ClientGrowPaymentsRow | null | undefined
  client: ClientGrowPaymentsRow | null | undefined
  projectId?: string | null
}): ResolvedGrowMerchant | null {
  if (opts.project && isGrowCollectionsConfigured(opts.project)) {
    return {
      userId: opts.project.grow_user_id!.trim(),
      source: 'project',
      projectId: opts.projectId ?? null,
      enabled: true,
    }
  }
  if (opts.client && isGrowCollectionsConfigured(opts.client)) {
    return {
      userId: opts.client.grow_user_id!.trim(),
      source: 'client',
      projectId: opts.projectId ?? null,
      enabled: true,
    }
  }
  return null
}

export function projectGrowAccountStatus(
  project: ClientGrowPaymentsRow | null | undefined
): GrowCollectionsAccountStatus {
  return buildGrowCollectionsAccountStatus({
    platformConfigured: isGrowPlatformConfigured(),
    enabled: project?.grow_enabled === true,
    userId: project?.grow_user_id,
  })
}

export async function loadProjectGrowRow(
  admin: SupabaseClient,
  clientId: string,
  projectId: string
): Promise<ProjectGrowRow | null> {
  const { data, error } = await admin
    .from('projects')
    .select(PROJECT_GROW_SELECT)
    .eq('id', projectId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error || !data) return null
  return data as ProjectGrowRow
}

export async function listClientProjectGrowRows(
  admin: SupabaseClient,
  clientId: string
): Promise<ProjectGrowRow[]> {
  const { data, error } = await admin
    .from('projects')
    .select(PROJECT_GROW_SELECT)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('name', { ascending: true })
  if (error) {
    console.error('[project-grow-list]', error.message)
    return []
  }
  return (data || []) as ProjectGrowRow[]
}

/**
 * userId must not appear on any other client or project (money settles to one merchant).
 */
export async function findOtherUsingGrowUserId(
  admin: SupabaseClient,
  userId: string,
  opts: { excludeClientId?: string | null; excludeProjectId?: string | null }
): Promise<{ kind: 'client' | 'project'; id: string; name: string | null } | null> {
  const key = normalizeGrowUserId(userId)
  if (!key) return null

  let clientQ = admin.from('clients').select('id, name').eq('grow_user_id', key).limit(1)
  if (opts.excludeClientId) clientQ = clientQ.neq('id', opts.excludeClientId)
  const { data: client, error: clientErr } = await clientQ.maybeSingle()
  if (clientErr) {
    console.error('[grow-user-id-unique-client]', clientErr.message)
  } else if (client) {
    return { kind: 'client', id: client.id, name: client.name }
  }

  let projectQ = admin
    .from('projects')
    .select('id, name')
    .eq('grow_user_id', key)
    .limit(1)
  if (opts.excludeProjectId) projectQ = projectQ.neq('id', opts.excludeProjectId)
  const { data: project, error: projectErr } = await projectQ.maybeSingle()
  if (projectErr) {
    console.error('[grow-user-id-unique-project]', projectErr.message)
  } else if (project) {
    return { kind: 'project', id: project.id, name: project.name }
  }

  return null
}

export function assertProjectCanEnableGrow(opts: {
  enabled: boolean
  userId: string | null | undefined
}): { ok: true } | { ok: false; error: string } {
  return assertTenantCanEnableGrow(opts)
}
