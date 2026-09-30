import type { SupabaseClient } from '@supabase/supabase-js'
import type { RecommendationEventType } from './types'

export async function recordRecommendationEvent(
  admin: SupabaseClient,
  params: {
    clientId: string
    recommendationId: string
    eventType: RecommendationEventType
    actor?: string | null
    meta?: Record<string, unknown>
  }
): Promise<void> {
  const { error } = await admin.from('management_recommendation_events').insert({
    client_id: params.clientId,
    recommendation_id: params.recommendationId,
    event_type: params.eventType,
    actor: params.actor ?? null,
    meta: params.meta ?? {},
  })
  if (error) {
    console.error('[recommendations] event insert failed', error.message)
  }
}
