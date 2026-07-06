import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProjectRow } from '@/lib/whatsapp-interactive'
import { buildBuildingSearchQueries } from '@/lib/whatsapp-address-extract'
import {
  rankProjectsByBuildingSearch,
  searchProjectsByBuildingFromList,
} from '@/lib/whatsapp-building-search'

export function searchProjectsInList(projects: ProjectRow[], searchText: string): ProjectRow[] {
  return searchProjectsByBuildingFromListWithVariants(projects, searchText)
}

export function parseStartCode(text: string) {
  const match = text.trim().toUpperCase().match(/^START_(BMK\d+)(?:_(.+))?$/i)
  if (!match) return null
  return {
    projectCode: match[1],
    buildingNumber: match[2] ? match[2].trim() : null,
  }
}

export function isNumericSelection(text: string): number | null {
  const trimmed = text.trim()
  const n = parseInt(trimmed, 10)
  if (!Number.isFinite(n) || n < 1 || n > 10 || String(n) !== trimmed) return null
  return n
}

export function searchProjectsByBuildingFromListWithVariants(
  projects: ProjectRow[],
  rawText: string
): ProjectRow[] {
  const trimmed = rawText.trim()
  if (trimmed.length < 2 || projects.length === 0) return []

  const queries = buildBuildingSearchQueries(trimmed)
  const scoreById = new Map<string, { project: ProjectRow; score: number }>()

  for (const query of queries) {
    const ranked = rankProjectsByBuildingSearch(projects, query)
    ranked.forEach((project, idx) => {
      const score = 300 - idx * 10 + Math.min(query.length, 40)
      const prev = scoreById.get(project.id)
      if (!prev || score > prev.score) {
        scoreById.set(project.id, { project, score })
      }
    })
  }

  if (scoreById.size === 0) {
    return searchProjectsByBuildingFromList(projects, trimmed)
  }

  return [...scoreById.values()]
    .sort((a, b) => b.score - a.score)
    .map((row) => row.project)
    .slice(0, 10)
}

/** WhatsApp interactive list supports at most 10 rows. */
export const WA_PROJECT_LIST_MAX_ROWS = 10

export async function fetchAllProjectsForClient(
  supabaseAdmin: SupabaseClient,
  clientId: string
): Promise<ProjectRow[]> {
  const { data: projects, error } = await supabaseAdmin
    .from('projects')
    .select('id, name, project_code, address')
    .eq('client_id', clientId)
    .order('name', { ascending: true })

  if (error) return []
  return (projects || []) as ProjectRow[]
}

export async function searchProjectsByBuilding(
  searchText: string,
  supabaseAdmin: SupabaseClient,
  clientId: string
): Promise<ProjectRow[]> {
  const trimmed = searchText.trim()
  if (trimmed.length < 2) return []

  const projects = await fetchAllProjectsForClient(supabaseAdmin, clientId)
  return searchProjectsByBuildingFromListWithVariants(projects, trimmed)
}

export async function createPendingSelection(
  phoneNumber: string,
  candidateProjects: ProjectRow[],
  supabaseAdmin: SupabaseClient,
  clientId: string,
  preferredLanguage?: string | null
): Promise<boolean> {
  const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString()
  const row: Record<string, unknown> = {
    phone_number: phoneNumber,
    client_id: clientId,
    candidate_projects: candidateProjects,
    created_at: new Date().toISOString(),
    expires_at: expiresAt,
  }
  if (preferredLanguage) row.preferred_language = preferredLanguage
  const { error } = await supabaseAdmin.from('pending_selections').insert(row)
  return !error
}

export async function getPendingSelection(
  phoneNumber: string,
  supabaseAdmin: SupabaseClient,
  clientId: string
) {
  const { data, error } = await supabaseAdmin
    .from('pending_selections')
    .select('id, candidate_projects, created_at, expires_at, preferred_language')
    .eq('phone_number', phoneNumber)
    .eq('client_id', clientId)
    .maybeSingle()

  if (error || !data) return null
  if (data.expires_at && new Date(data.expires_at as string) < new Date()) {
    await supabaseAdmin.from('pending_selections').delete().eq('id', data.id)
    return null
  }
  return data as {
    id: string
    candidate_projects: ProjectRow[]
    created_at: string
    expires_at: string
    preferred_language?: string | null
  }
}

export async function clearPendingSelection(
  phoneNumber: string,
  supabaseAdmin: SupabaseClient,
  clientId: string
) {
  await supabaseAdmin
    .from('pending_selections')
    .delete()
    .eq('phone_number', phoneNumber)
    .eq('client_id', clientId)
}
