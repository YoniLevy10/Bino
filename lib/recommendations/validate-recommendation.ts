import type { SupabaseClient } from '@supabase/supabase-js'
import { recordRecommendationEvent } from './record-event'
import type { ManagementRecommendationRow } from './types'

function isSnoozedActive(row: ManagementRecommendationRow, now = new Date()): boolean {
  if (row.status !== 'snoozed') return false
  if (!row.snoozed_until) return true
  return new Date(row.snoozed_until).getTime() > now.getTime()
}

async function markResolved(
  admin: SupabaseClient,
  row: ManagementRecommendationRow,
  source: string
): Promise<void> {
  if (row.status === 'resolved') return
  const now = new Date().toISOString()
  await admin
    .from('management_recommendations')
    .update({
      status: 'resolved',
      resolved_at: now,
      resolved_by: 'system',
      resolution_source: source,
      updated_at: now,
      last_validated_at: now,
    })
    .eq('id', row.id)
    .eq('client_id', row.client_id)

  await recordRecommendationEvent(admin, {
    clientId: row.client_id,
    recommendationId: row.id,
    eventType: 'condition_cleared',
    actor: 'system',
    meta: { source, previous_status: row.status },
  })
}

async function ticketStillNeedsSlaUnassigned(
  admin: SupabaseClient,
  clientId: string,
  ticketId: string
): Promise<boolean> {
  const { data } = await admin
    .from('tickets')
    .select('id, status, assigned_worker_id, deleted_at')
    .eq('id', ticketId)
    .eq('client_id', clientId)
    .maybeSingle()
  if (!data || data.deleted_at || data.status === 'CLOSED') return false
  if (data.assigned_worker_id) return false
  return true
}

async function ticketStillOpen(admin: SupabaseClient, clientId: string, ticketId: string): Promise<boolean> {
  const { data } = await admin
    .from('tickets')
    .select('id, status, deleted_at')
    .eq('id', ticketId)
    .eq('client_id', clientId)
    .maybeSingle()
  if (!data || data.deleted_at || data.status === 'CLOSED') return false
  return true
}

async function taskStillOverdue(admin: SupabaseClient, clientId: string, taskId: string): Promise<boolean> {
  const { data } = await admin
    .from('maintenance_tasks')
    .select('id, status, due_at, deleted_at')
    .eq('id', taskId)
    .eq('client_id', clientId)
    .maybeSingle()
  if (!data || data.deleted_at || data.status === 'DONE') return false
  if (!data.due_at) return false
  return new Date(data.due_at).getTime() < Date.now()
}

async function collectionsBucketStillRelevant(
  admin: SupabaseClient,
  clientId: string,
  type: string,
  entityId: string
): Promise<boolean> {
  const status =
    type === 'collections_drafts'
      ? 'draft'
      : type === 'collections_send_failed'
        ? 'failed'
        : type === 'collections_sent_unpaid'
          ? 'sent'
          : null
  if (!status) return false

  let q = admin
    .from('collection_charges')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('status', status)

  if (entityId && entityId !== '00000000-0000-0000-0000-000000000000') {
    q = q.eq('project_id', entityId)
  }

  const { count } = await q
  return (count ?? 0) > 0
}

async function projectVolumeStillRelevant(
  admin: SupabaseClient,
  clientId: string,
  projectId: string,
  minCount: number,
  windowDays: number
): Promise<boolean> {
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString()
  const { count } = await admin
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .gte('created_at', since)
  return (count ?? 0) >= minCount
}

/**
 * Returns true if the recommendation should remain in the active UI.
 * Side effect: marks resolved when underlying condition cleared.
 */
export async function validateRecommendationRelevance(
  admin: SupabaseClient,
  row: ManagementRecommendationRow
): Promise<boolean> {
  if (row.status === 'resolved' || row.status === 'irrelevant') return false
  if (isSnoozedActive(row)) return false

  // Expired snooze → treat as active for validation
  if (row.status === 'snoozed' && !isSnoozedActive(row)) {
    await admin
      .from('management_recommendations')
      .update({ status: 'active', snoozed_until: null, updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('client_id', row.client_id)
  }

  const type = row.recommendation_type
  const clientId = row.client_id
  let stillRelevant = true

  switch (type) {
    case 'sla_unassigned':
      stillRelevant = await ticketStillNeedsSlaUnassigned(admin, clientId, row.entity_id)
      break
    case 'professional_followup':
    case 'professional_forward_failed':
      stillRelevant = await ticketStillOpen(admin, clientId, row.entity_id)
      break
    case 'maintenance_overdue':
      stillRelevant = await taskStillOverdue(admin, clientId, row.entity_id)
      break
    case 'building_ticket_volume': {
      const min = Number((row.facts as { min_count?: number }).min_count) || 7
      const days = Number((row.facts as { window_days?: number }).window_days) || 30
      stillRelevant = await projectVolumeStillRelevant(admin, clientId, row.entity_id, min, days)
      break
    }
    case 'building_topic_recurrence': {
      const min = Number((row.facts as { min_count?: number }).min_count) || 3
      const days = Number((row.facts as { window_days?: number }).window_days) || 30
      // Topic recurrence: at least volume check; detailed re-detect happens on next scan
      stillRelevant = await projectVolumeStillRelevant(admin, clientId, row.entity_id, min, days)
      break
    }
    case 'collections_drafts':
    case 'collections_send_failed':
    case 'collections_sent_unpaid':
      stillRelevant = await collectionsBucketStillRelevant(admin, clientId, type, row.entity_id)
      break
    default:
      stillRelevant = true
  }

  if (!stillRelevant) {
    await markResolved(admin, row, 'condition_cleared')
    return false
  }

  await admin
    .from('management_recommendations')
    .update({ last_validated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('client_id', clientId)

  return true
}

export async function filterRelevantRecommendations(
  admin: SupabaseClient,
  rows: ManagementRecommendationRow[]
): Promise<ManagementRecommendationRow[]> {
  const out: ManagementRecommendationRow[] = []
  for (const row of rows) {
    if (await validateRecommendationRelevance(admin, row)) {
      out.push(row)
    }
  }
  return out
}
