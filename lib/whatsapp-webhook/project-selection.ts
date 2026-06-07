import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProjectRow } from '@/lib/whatsapp-interactive'

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
  if (!/^[1-3]$/.test(trimmed)) return null
  return parseInt(trimmed, 10)
}

export async function searchProjectsByBuilding(
  searchText: string,
  supabaseAdmin: SupabaseClient,
  clientId: string
): Promise<ProjectRow[]> {
  const trimmed = searchText.trim()
  if (trimmed.length < 2) return []

  const lowerSearch = trimmed.toLowerCase()
  const { data: projects, error } = await supabaseAdmin
    .from('projects')
    .select('id, name, project_code, address')
    .eq('client_id', clientId)
    .order('project_code', { ascending: true })

  if (error) return []

  return (projects || [])
    .filter(
      (p: ProjectRow) =>
        p.name?.toLowerCase().includes(lowerSearch) ||
        p.address?.toLowerCase().includes(lowerSearch) ||
        p.project_code?.toLowerCase().includes(lowerSearch)
    )
    .slice(0, 3)
}

export async function createPendingSelection(
  phoneNumber: string,
  candidateProjects: ProjectRow[],
  supabaseAdmin: SupabaseClient,
  clientId: string
): Promise<boolean> {
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  const { error } = await supabaseAdmin.from('pending_selections').insert({
    phone_number: phoneNumber,
    client_id: clientId,
    candidate_projects: candidateProjects,
    created_at: new Date().toISOString(),
    expires_at: expiresAt,
  })
  return !error
}

export async function getPendingSelection(
  phoneNumber: string,
  supabaseAdmin: SupabaseClient,
  clientId: string
) {
  const { data, error } = await supabaseAdmin
    .from('pending_selections')
    .select('id, candidate_projects, created_at, expires_at')
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
