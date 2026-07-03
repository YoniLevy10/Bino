import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProjectRow } from '@/lib/whatsapp-interactive'
import { createPendingSelection, getPendingSelection, clearPendingSelection } from '@/lib/whatsapp-webhook/project-selection'

export const STASHED_BUILDING_SEARCH_CODE = '__SEARCH__'

export function isStashedBuildingSearchRow(project: ProjectRow): boolean {
  return project.project_code === STASHED_BUILDING_SEARCH_CODE
}

export function stashedBuildingSearchText(projects: ProjectRow[] | null | undefined): string | null {
  const row = projects?.find(isStashedBuildingSearchRow)
  const text = row?.name?.trim() || row?.address?.trim()
  return text || null
}

/** Remember address typed before language was chosen. */
export async function stashBuildingSearchText(
  phoneNumber: string,
  searchText: string,
  supabaseAdmin: SupabaseClient,
  clientId: string
): Promise<void> {
  await clearPendingSelection(phoneNumber, supabaseAdmin, clientId)
  await createPendingSelection(
    phoneNumber,
    [
      {
        id: STASHED_BUILDING_SEARCH_CODE,
        name: searchText.trim(),
        project_code: STASHED_BUILDING_SEARCH_CODE,
        address: searchText.trim(),
      },
    ],
    supabaseAdmin,
    clientId
  )
}

export async function readStashedBuildingSearchText(
  phoneNumber: string,
  supabaseAdmin: SupabaseClient,
  clientId: string
): Promise<string | null> {
  const pending = await getPendingSelection(phoneNumber, supabaseAdmin, clientId)
  return stashedBuildingSearchText(pending?.candidate_projects)
}
