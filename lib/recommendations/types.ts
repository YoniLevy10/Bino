export const RECOMMENDATION_TYPES = [
  'sla_unassigned',
  'maintenance_overdue',
  'professional_followup',
  'professional_forward_failed',
  'building_ticket_volume',
  'building_topic_recurrence',
  'collections_drafts',
  'collections_send_failed',
  'collections_sent_unpaid',
] as const

export type RecommendationType = (typeof RECOMMENDATION_TYPES)[number]

export const ENTITY_TYPES = ['ticket', 'maintenance_task', 'project', 'collection_bucket'] as const
export type EntityType = (typeof ENTITY_TYPES)[number]

export const URGENCY_LEVELS = ['critical', 'high', 'medium', 'low'] as const
export type Urgency = (typeof URGENCY_LEVELS)[number]

export const RECOMMENDATION_STATUSES = ['active', 'snoozed', 'resolved', 'irrelevant'] as const
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number]

export type RecommendationAction = {
  id: string
  label: string
  href?: string
  kind?: 'navigate' | 'snooze' | 'dismiss' | 'midrag' | 'set_follow_up' | 'create_task'
  /** Paid addon required to show this action */
  requiresAddon?: string
}

export type RecommendationDraft = {
  recommendationType: RecommendationType
  entityType: EntityType
  entityId: string
  dedupeKey: string
  urgency: Urgency
  reason: string
  facts: Record<string, unknown>
  primaryAction: string | null
  primaryActionHref: string | null
  actions: RecommendationAction[]
}

export type ManagementRecommendationRow = {
  id: string
  client_id: string
  recommendation_type: RecommendationType | string
  entity_type: EntityType | string
  entity_id: string
  dedupe_key: string
  urgency: Urgency | string
  reason: string
  facts: Record<string, unknown>
  primary_action: string | null
  primary_action_href: string | null
  actions: RecommendationAction[] | unknown
  status: RecommendationStatus | string
  detected_at: string
  updated_at: string
  snoozed_until: string | null
  acted_by: string | null
  acted_at: string | null
  resolved_by: string | null
  resolved_at: string | null
  resolution_source: string | null
  last_validated_at: string | null
}

export type RecommendationEventType =
  | 'shown'
  | 'opened'
  | 'snoozed'
  | 'dismissed'
  | 'action_chosen'
  | 'action_succeeded'
  | 'condition_cleared'
  | 'midrag_search_opened'

/** Sentinel entity id for client-wide collection buckets (not a real project). */
export const CLIENT_COLLECTION_BUCKET_ID = '00000000-0000-0000-0000-000000000000'

export const URGENCY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}
