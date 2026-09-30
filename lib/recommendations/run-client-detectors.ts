import type { SupabaseClient } from '@supabase/supabase-js'
import { detectSlaUnassigned } from './detectors/sla-unassigned'
import { detectMaintenanceOverdue } from './detectors/maintenance-overdue'
import { detectProfessionalFollowup } from './detectors/professional-followup'
import { detectBuildingVolumeAndTopics } from './detectors/building-volume'
import { detectCollectionsFollowup } from './detectors/collections'
import { upsertRecommendation } from './upsert-recommendation'
import { recordRecommendationEvent } from './record-event'
import type { RecommendationDraft } from './types'

export type DetectorRunResult = {
  drafts: number
  upserted: number
  cleared: number
}

/**
 * Run all detectors for a single tenant and upsert results.
 * Also resolves previously active rows whose dedupe_key was not re-detected.
 */
export async function runClientDetectors(
  admin: SupabaseClient,
  clientId: string
): Promise<DetectorRunResult> {
  const draftLists = await Promise.all([
    detectSlaUnassigned(admin, clientId),
    detectMaintenanceOverdue(admin, clientId),
    detectProfessionalFollowup(admin, clientId),
    detectBuildingVolumeAndTopics(admin, clientId),
    detectCollectionsFollowup(admin, clientId),
  ])

  const drafts: RecommendationDraft[] = draftLists.flat()
  const seenKeys = new Set(drafts.map((d) => d.dedupeKey))

  let upserted = 0
  for (const draft of drafts) {
    const id = await upsertRecommendation(admin, clientId, draft)
    if (id) upserted += 1
  }

  // Clear active/snoozed rows that detectors no longer emit
  const { data: existing } = await admin
    .from('management_recommendations')
    .select('id, dedupe_key, status')
    .eq('client_id', clientId)
    .in('status', ['active', 'snoozed'])

  let cleared = 0
  const now = new Date().toISOString()
  for (const row of existing || []) {
    if (seenKeys.has(row.dedupe_key as string)) continue
    const { error } = await admin
      .from('management_recommendations')
      .update({
        status: 'resolved',
        resolved_at: now,
        resolved_by: 'system',
        resolution_source: 'condition_cleared',
        updated_at: now,
        last_validated_at: now,
      })
      .eq('id', row.id as string)
      .eq('client_id', clientId)
    if (!error) {
      cleared += 1
      await recordRecommendationEvent(admin, {
        clientId,
        recommendationId: row.id as string,
        eventType: 'condition_cleared',
        actor: 'system',
        meta: { source: 'detector_absent' },
      })
    }
  }

  return { drafts: drafts.length, upserted, cleared }
}
