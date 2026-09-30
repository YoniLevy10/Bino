import type { SupabaseClient } from '@supabase/supabase-js'
import type { RecommendationDraft } from './types'

export async function upsertRecommendation(
  admin: SupabaseClient,
  clientId: string,
  draft: RecommendationDraft
): Promise<string | null> {
  const { data, error } = await admin.rpc('upsert_management_recommendation', {
    p_client_id: clientId,
    p_recommendation_type: draft.recommendationType,
    p_entity_type: draft.entityType,
    p_entity_id: draft.entityId,
    p_dedupe_key: draft.dedupeKey,
    p_urgency: draft.urgency,
    p_reason: draft.reason,
    p_facts: draft.facts,
    p_primary_action: draft.primaryAction,
    p_primary_action_href: draft.primaryActionHref,
    p_actions: draft.actions,
  })

  if (error) {
    console.error('[recommendations] upsert failed', error.message)
    return null
  }
  return typeof data === 'string' ? data : null
}

export async function upsertRecommendations(
  admin: SupabaseClient,
  clientId: string,
  drafts: RecommendationDraft[]
): Promise<number> {
  let n = 0
  for (const draft of drafts) {
    const id = await upsertRecommendation(admin, clientId, draft)
    if (id) n += 1
  }
  return n
}
