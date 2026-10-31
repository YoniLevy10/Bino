import type { SupabaseClient } from '@supabase/supabase-js'
import { recordRecommendationEvent } from './record-event'
import type { ManagementRecommendationRow } from './types'

/** Sentinel project id: collections row counts the whole tenant, not one building. */
const NIL_PROJECT_ID = '00000000-0000-0000-0000-000000000000'

/** One `.in()` list stays under PostgREST's default row cap. */
const ID_CHUNK = 200
const PAGE_SIZE = 1000
const MAX_PAGES = 8

type DbError = { message: string }

/**
 * A relevance read failed. Callers must not treat this as "still relevant"
 * or as "condition cleared".
 */
export class RecommendationValidationFetchError extends Error {
  readonly table: string
  constructor(table: string, message: string) {
    super(message)
    this.name = 'RecommendationValidationFetchError'
    this.table = table
  }
}

type TicketSnap = {
  id: string
  status: string | null
  assigned_worker_id: string | null
  deleted_at: string | null
}

type TaskSnap = {
  id: string
  status: string | null
  due_at: string | null
  deleted_at: string | null
}

type VolumeSnap = {
  project_id: string | null
  created_at: string | null
}

type ChargeSnap = {
  status: string | null
  project_id: string | null
}

type ClientEvidence = {
  tickets: Map<string, TicketSnap>
  tasks: Map<string, TaskSnap>
  volume: VolumeSnap[]
  charges: ChargeSnap[]
}

function isSnoozedActive(row: ManagementRecommendationRow, now: Date): boolean {
  if (row.status !== 'snoozed') return false
  if (!row.snoozed_until) return true
  return new Date(row.snoozed_until).getTime() > now.getTime()
}

function assertFetched(table: string, error: DbError | null) {
  if (error) throw new RecommendationValidationFetchError(table, error.message)
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)]
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function volumeParams(row: ManagementRecommendationRow): { min: number; days: number } {
  const facts = (row.facts ?? {}) as { min_count?: number; window_days?: number }
  if (row.recommendation_type === 'building_topic_recurrence') {
    return { min: Number(facts.min_count) || 3, days: Number(facts.window_days) || 30 }
  }
  return { min: Number(facts.min_count) || 7, days: Number(facts.window_days) || 30 }
}

function chargeStatus(type: string): 'draft' | 'failed' | 'sent' | null {
  if (type === 'collections_drafts') return 'draft'
  if (type === 'collections_send_failed') return 'failed'
  if (type === 'collections_sent_unpaid') return 'sent'
  return null
}

function needsTicket(type: string): boolean {
  return (
    type === 'sla_unassigned' ||
    type === 'professional_followup' ||
    type === 'professional_forward_failed'
  )
}

function needsTask(type: string): boolean {
  return type === 'maintenance_overdue'
}

function needsVolume(type: string): boolean {
  return type === 'building_ticket_volume' || type === 'building_topic_recurrence'
}

function needsCharge(type: string): boolean {
  return chargeStatus(type) != null
}

async function fetchPages<T>(
  table: string,
  run: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: DbError | null }>
): Promise<T[]> {
  const out: T[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const { data, error } = await run(from, to)
    assertFetched(table, error)
    const batch = data ?? []
    out.push(...batch)
    if (batch.length < PAGE_SIZE) return out
  }
  throw new RecommendationValidationFetchError(table, 'result exceeded safe page cap')
}

async function loadClientEvidence(
  admin: SupabaseClient,
  clientId: string,
  rows: ManagementRecommendationRow[],
  now: Date
): Promise<ClientEvidence> {
  const tickets = new Map<string, TicketSnap>()
  const tasks = new Map<string, TaskSnap>()
  let volume: VolumeSnap[] = []
  let charges: ChargeSnap[] = []

  const ticketIds = unique(rows.filter((row) => needsTicket(row.recommendation_type)).map((row) => row.entity_id))
  for (const ids of chunks(ticketIds, ID_CHUNK)) {
    const { data, error } = await admin
      .from('tickets')
      .select('id, status, assigned_worker_id, deleted_at')
      .eq('client_id', clientId)
      .in('id', ids)
    assertFetched('tickets', error)
    for (const row of (data ?? []) as TicketSnap[]) tickets.set(row.id, row)
  }

  const taskIds = unique(rows.filter((row) => needsTask(row.recommendation_type)).map((row) => row.entity_id))
  for (const ids of chunks(taskIds, ID_CHUNK)) {
    const { data, error } = await admin
      .from('maintenance_tasks')
      .select('id, status, due_at, deleted_at')
      .eq('client_id', clientId)
      .in('id', ids)
    assertFetched('maintenance_tasks', error)
    for (const row of (data ?? []) as TaskSnap[]) tasks.set(row.id, row)
  }

  const volumeRows = rows.filter((row) => needsVolume(row.recommendation_type))
  if (volumeRows.length > 0) {
    const projectIds = unique(volumeRows.map((row) => row.entity_id))
    const maxDays = Math.max(...volumeRows.map((row) => volumeParams(row).days))
    const since = new Date(now.getTime() - maxDays * 86_400_000).toISOString()
    volume = await fetchPages('tickets', (from, to) =>
      admin
        .from('tickets')
        .select('project_id, created_at')
        .eq('client_id', clientId)
        .in('project_id', projectIds)
        .is('deleted_at', null)
        .gte('created_at', since)
        .range(from, to)
    )
  }

  const chargeRows = rows.filter((row) => needsCharge(row.recommendation_type))
  if (chargeRows.length > 0) {
    const statuses = unique(
      chargeRows
        .map((row) => chargeStatus(row.recommendation_type))
        .filter((status): status is 'draft' | 'failed' | 'sent' => status != null)
    )
    charges = await fetchPages('collection_charges', (from, to) =>
      admin
        .from('collection_charges')
        .select('status, project_id')
        .eq('client_id', clientId)
        .in('status', statuses)
        .range(from, to)
    )
  }

  return { tickets, tasks, volume, charges }
}

function stillRelevant(row: ManagementRecommendationRow, evidence: ClientEvidence, now: Date): boolean {
  const type = row.recommendation_type
  switch (type) {
    case 'sla_unassigned': {
      const ticket = evidence.tickets.get(row.entity_id)
      if (!ticket || ticket.deleted_at || ticket.status === 'CLOSED') return false
      if (ticket.assigned_worker_id) return false
      return true
    }
    case 'professional_followup':
    case 'professional_forward_failed': {
      const ticket = evidence.tickets.get(row.entity_id)
      if (!ticket || ticket.deleted_at || ticket.status === 'CLOSED') return false
      return true
    }
    case 'maintenance_overdue': {
      const task = evidence.tasks.get(row.entity_id)
      if (!task || task.deleted_at || task.status === 'DONE') return false
      if (!task.due_at) return false
      return new Date(task.due_at).getTime() < now.getTime()
    }
    case 'building_ticket_volume':
    case 'building_topic_recurrence': {
      const { min, days } = volumeParams(row)
      const sinceMs = now.getTime() - days * 86_400_000
      const count = evidence.volume.filter(
        (ticket) =>
          ticket.project_id === row.entity_id &&
          !!ticket.created_at &&
          new Date(ticket.created_at).getTime() >= sinceMs
      ).length
      return count >= min
    }
    case 'collections_drafts':
    case 'collections_send_failed':
    case 'collections_sent_unpaid': {
      const status = chargeStatus(type)
      if (!status) return false
      const scoped = evidence.charges.filter((charge) => {
        if (charge.status !== status) return false
        if (row.entity_id && row.entity_id !== NIL_PROJECT_ID) return charge.project_id === row.entity_id
        return true
      })
      return scoped.length > 0
    }
    default:
      return true
  }
}

async function updateRecommendationIds(
  admin: SupabaseClient,
  clientId: string,
  ids: string[],
  patch: Record<string, unknown>
) {
  if (ids.length === 0) return
  const { error } = await admin
    .from('management_recommendations')
    .update(patch)
    .in('id', ids)
    .eq('client_id', clientId)
  assertFetched('management_recommendations', error)
}

/**
 * Same rules as the previous per-row checks.
 * Reads are grouped by tenant: one tickets/tasks/charges fetch per client,
 * not one round trip per recommendation. A failed read throws and does not
 * resolve or keep the row.
 */
export async function filterRelevantRecommendations(
  admin: SupabaseClient,
  rows: ManagementRecommendationRow[],
  now = new Date()
): Promise<ManagementRecommendationRow[]> {
  const candidates: ManagementRecommendationRow[] = []
  for (const row of rows) {
    if (row.status === 'resolved' || row.status === 'irrelevant') continue
    if (isSnoozedActive(row, now)) continue
    candidates.push(row)
  }

  const byClient = new Map<string, ManagementRecommendationRow[]>()
  for (const row of candidates) {
    const list = byClient.get(row.client_id) ?? []
    list.push(row)
    byClient.set(row.client_id, list)
  }

  const evidenceByClient = new Map<string, ClientEvidence>()
  for (const [clientId, clientRows] of byClient) {
    evidenceByClient.set(clientId, await loadClientEvidence(admin, clientId, clientRows, now))
  }

  const kept: ManagementRecommendationRow[] = []
  const resolvePlain = new Map<string, ManagementRecommendationRow[]>()
  const resolveWake = new Map<string, ManagementRecommendationRow[]>()
  const touchPlain = new Map<string, string[]>()
  const touchWake = new Map<string, string[]>()

  const pushGroup = (map: Map<string, ManagementRecommendationRow[]>, row: ManagementRecommendationRow) => {
    const list = map.get(row.client_id) ?? []
    list.push(row)
    map.set(row.client_id, list)
  }

  for (const row of candidates) {
    const evidence = evidenceByClient.get(row.client_id)
    if (!evidence) throw new RecommendationValidationFetchError('management_recommendations', 'missing tenant evidence')
    const wake = row.status === 'snoozed'
    if (!stillRelevant(row, evidence, now)) {
      pushGroup(wake ? resolveWake : resolvePlain, row)
      continue
    }
    kept.push(row)
    const ids = (wake ? touchWake : touchPlain).get(row.client_id) ?? []
    ids.push(row.id)
    ;(wake ? touchWake : touchPlain).set(row.client_id, ids)
  }

  const validatedAt = now.toISOString()
  for (const [clientId, group] of resolvePlain) {
    await updateRecommendationIds(admin, clientId, group.map((row) => row.id), {
      status: 'resolved',
      resolved_at: validatedAt,
      resolved_by: 'system',
      resolution_source: 'condition_cleared',
      updated_at: validatedAt,
      last_validated_at: validatedAt,
    })
    for (const row of group) {
      await recordRecommendationEvent(admin, {
        clientId,
        recommendationId: row.id,
        eventType: 'condition_cleared',
        actor: 'system',
        meta: { source: 'condition_cleared', previous_status: row.status },
      })
    }
  }
  for (const [clientId, group] of resolveWake) {
    await updateRecommendationIds(admin, clientId, group.map((row) => row.id), {
      status: 'resolved',
      snoozed_until: null,
      resolved_at: validatedAt,
      resolved_by: 'system',
      resolution_source: 'condition_cleared',
      updated_at: validatedAt,
      last_validated_at: validatedAt,
    })
    for (const row of group) {
      await recordRecommendationEvent(admin, {
        clientId,
        recommendationId: row.id,
        eventType: 'condition_cleared',
        actor: 'system',
        meta: { source: 'condition_cleared', previous_status: row.status },
      })
    }
  }
  for (const [clientId, ids] of touchPlain) {
    await updateRecommendationIds(admin, clientId, ids, { last_validated_at: validatedAt })
  }
  for (const [clientId, ids] of touchWake) {
    await updateRecommendationIds(admin, clientId, ids, {
      status: 'active',
      snoozed_until: null,
      updated_at: validatedAt,
      last_validated_at: validatedAt,
    })
  }

  return kept
}

/** Single-row path used when a manager acts on one recommendation. */
export async function validateRecommendationRelevance(
  admin: SupabaseClient,
  row: ManagementRecommendationRow
): Promise<boolean> {
  const kept = await filterRelevantRecommendations(admin, [row])
  return kept.some((item) => item.id === row.id)
}
