import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProjectRow } from '@/lib/whatsapp-interactive'
import { createPendingSelection, getPendingSelection, clearPendingSelection } from '@/lib/whatsapp-webhook/project-selection'

export const STASHED_BUILDING_SEARCH_CODE = '__SEARCH__'
export const STASHED_DESCRIPTION_CODE = '__DESC__'
export const STASHED_MEDIA_CODE = '__MEDIA__'

const STASH_CODES = new Set([
  STASHED_BUILDING_SEARCH_CODE,
  STASHED_DESCRIPTION_CODE,
  STASHED_MEDIA_CODE,
])

export function isStashedBuildingSearchRow(project: ProjectRow): boolean {
  return project.project_code === STASHED_BUILDING_SEARCH_CODE
}

export function isStashedDescriptionRow(project: ProjectRow): boolean {
  return project.project_code === STASHED_DESCRIPTION_CODE
}

export function isStashedMediaRow(project: ProjectRow): boolean {
  return project.project_code === STASHED_MEDIA_CODE
}

export function isStashRow(project: ProjectRow): boolean {
  return STASH_CODES.has(project.project_code)
}

export function stashedBuildingSearchText(projects: ProjectRow[] | null | undefined): string | null {
  const row = projects?.find(isStashedBuildingSearchRow)
  const text = row?.name?.trim() || row?.address?.trim()
  return text || null
}

export function stashedProblemDescription(projects: ProjectRow[] | null | undefined): string | null {
  const row = projects?.find(isStashedDescriptionRow)
  const text = row?.name?.trim() || row?.address?.trim()
  return text || null
}

export function stashedPreSessionMedia(
  projects: ProjectRow[] | null | undefined
): { mediaId: string; mediaKind: 'image' | 'video' } | null {
  const row = projects?.find(isStashedMediaRow)
  const mediaId = row?.name?.trim()
  if (!mediaId) return null
  const kind = row?.address?.trim() === 'video' ? 'video' : 'image'
  return { mediaId, mediaKind: kind }
}

function realCandidateProjects(projects: ProjectRow[] | null | undefined): ProjectRow[] {
  return (projects || []).filter((p) => !isStashRow(p))
}

async function upsertStashRows(
  phoneNumber: string,
  supabaseAdmin: SupabaseClient,
  clientId: string,
  stashRows: ProjectRow[],
  preferredLanguage?: string | null
): Promise<void> {
  const pending = await getPendingSelection(phoneNumber, supabaseAdmin, clientId)
  const keptReal = realCandidateProjects(pending?.candidate_projects)
  const existingStash = (pending?.candidate_projects || []).filter(isStashRow)
  const replaceCodes = new Set(stashRows.map((r) => r.project_code))
  const mergedStash = [
    ...existingStash.filter((r) => !replaceCodes.has(r.project_code)),
    ...stashRows,
  ]
  await clearPendingSelection(phoneNumber, supabaseAdmin, clientId)
  await createPendingSelection(
    phoneNumber,
    [...mergedStash, ...keptReal],
    supabaseAdmin,
    clientId,
    preferredLanguage ?? pending?.preferred_language ?? null
  )
}

/** Remember address typed before language was chosen. */
export async function stashBuildingSearchText(
  phoneNumber: string,
  searchText: string,
  supabaseAdmin: SupabaseClient,
  clientId: string
): Promise<void> {
  const trimmed = searchText.trim()
  if (!trimmed) return
  await upsertStashRows(phoneNumber, supabaseAdmin, clientId, [
    {
      id: STASHED_BUILDING_SEARCH_CODE,
      name: trimmed,
      project_code: STASHED_BUILDING_SEARCH_CODE,
      address: trimmed,
    },
  ])
}

/** Remember problem description sent before building was identified. */
export async function stashProblemDescription(
  phoneNumber: string,
  description: string,
  supabaseAdmin: SupabaseClient,
  clientId: string
): Promise<void> {
  const trimmed = description.trim()
  if (!trimmed) return
  await upsertStashRows(phoneNumber, supabaseAdmin, clientId, [
    {
      id: STASHED_DESCRIPTION_CODE,
      name: trimmed,
      project_code: STASHED_DESCRIPTION_CODE,
      address: trimmed,
    },
  ])
}

/** Remember image/video sent before a session exists. */
export async function stashPreSessionMedia(
  phoneNumber: string,
  mediaId: string,
  mediaKind: 'image' | 'video',
  supabaseAdmin: SupabaseClient,
  clientId: string
): Promise<void> {
  if (!mediaId.trim()) return
  await upsertStashRows(phoneNumber, supabaseAdmin, clientId, [
    {
      id: STASHED_MEDIA_CODE,
      name: mediaId.trim(),
      project_code: STASHED_MEDIA_CODE,
      address: mediaKind,
    },
  ])
}

export async function readStashedBuildingSearchText(
  phoneNumber: string,
  supabaseAdmin: SupabaseClient,
  clientId: string
): Promise<string | null> {
  const pending = await getPendingSelection(phoneNumber, supabaseAdmin, clientId)
  return stashedBuildingSearchText(pending?.candidate_projects)
}

export async function readStashedProblemDescription(
  phoneNumber: string,
  supabaseAdmin: SupabaseClient,
  clientId: string
): Promise<string | null> {
  const pending = await getPendingSelection(phoneNumber, supabaseAdmin, clientId)
  return stashedProblemDescription(pending?.candidate_projects)
}

export async function readStashedPreSessionMedia(
  phoneNumber: string,
  supabaseAdmin: SupabaseClient,
  clientId: string
): Promise<{ mediaId: string; mediaKind: 'image' | 'video' } | null> {
  const pending = await getPendingSelection(phoneNumber, supabaseAdmin, clientId)
  return stashedPreSessionMedia(pending?.candidate_projects)
}

/** Copy stashed pre-session media into the active session row for ticket attach. */
export async function promoteStashedMediaToSession(
  phoneNumber: string,
  sessionId: string,
  supabaseAdmin: SupabaseClient,
  clientId: string
): Promise<void> {
  const media = await readStashedPreSessionMedia(phoneNumber, supabaseAdmin, clientId)
  if (!media) return

  const { error } = await supabaseAdmin
    .from('sessions')
    .update({
      pending_whatsapp_media_id: media.mediaId,
      pending_whatsapp_media_type: media.mediaKind,
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', sessionId)

  if (error) {
    loggerWarn('promote stashed media to session failed', error.message)
    return
  }

  const pending = await getPendingSelection(phoneNumber, supabaseAdmin, clientId)
  if (!pending) return
  const withoutMedia = (pending.candidate_projects || []).filter((p) => !isStashedMediaRow(p))
  await clearPendingSelection(phoneNumber, supabaseAdmin, clientId)
  if (withoutMedia.length > 0) {
    await createPendingSelection(
      phoneNumber,
      withoutMedia,
      supabaseAdmin,
      clientId,
      pending.preferred_language ?? null
    )
  }
}

function loggerWarn(msg: string, err: string) {
  console.warn('[building-search-stash]', msg, err)
}
