import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  filterRelevantRecommendations,
  RecommendationValidationFetchError,
} from '@/lib/recommendations/validate-recommendation'
import type { ManagementRecommendationRow } from '@/lib/recommendations/types'

const NOW = new Date('2026-10-31T12:00:00Z')
const CLIENT_A = 'client-a'
const CLIENT_B = 'client-b'

type Filter = { op: 'eq' | 'in' | 'is' | 'gte'; column: string; value: unknown }
type Recorded = { table: string; action: 'select' | 'update' | 'insert'; filters: Filter[]; payload?: unknown }

function row(partial: Partial<ManagementRecommendationRow> & Pick<ManagementRecommendationRow, 'id' | 'recommendation_type' | 'entity_id'>): ManagementRecommendationRow {
  return {
    client_id: CLIENT_A,
    entity_type: 'ticket',
    dedupe_key: `${partial.recommendation_type}:${partial.entity_id}`,
    urgency: 'high',
    reason: 'בדיקה',
    facts: {},
    primary_action: null,
    primary_action_href: null,
    actions: [],
    status: 'active',
    detected_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    snoozed_until: null,
    acted_by: null,
    acted_at: null,
    resolved_by: null,
    resolved_at: null,
    resolution_source: null,
    last_validated_at: null,
    ...partial,
  }
}

function createAdmin(opts?: {
  tickets?: Array<Record<string, unknown>>
  tasks?: Array<Record<string, unknown>>
  charges?: Array<Record<string, unknown>>
  volumeTickets?: Array<Record<string, unknown>>
  failSelect?: string
  /** Every page returns a full page, so the reader must stop instead of guessing. */
  repeatFullPages?: boolean
}) {
  const calls: Recorded[] = []

  function matches(filters: Filter[], item: Record<string, unknown>): boolean {
    for (const filter of filters) {
      if (filter.op === 'eq' && item[filter.column] !== filter.value) return false
      if (filter.op === 'in' && !(filter.value as unknown[]).includes(item[filter.column])) return false
      if (filter.op === 'is' && filter.value === null && item[filter.column] != null) return false
      if (filter.op === 'gte') {
        const left = item[filter.column]
        if (typeof left !== 'string' || left < String(filter.value)) return false
      }
    }
    return true
  }

  function from(table: string) {
    const state: Recorded & { range: [number, number] | null } = {
      table,
      action: 'select',
      filters: [],
      range: null,
    }
    const builder = {
      select() {
        state.action = 'select'
        return builder
      },
      update(payload: unknown) {
        state.action = 'update'
        state.payload = payload
        return builder
      },
      insert(payload: unknown) {
        state.action = 'insert'
        state.payload = payload
        return builder
      },
      eq(column: string, value: unknown) {
        state.filters.push({ op: 'eq', column, value })
        return builder
      },
      in(column: string, value: unknown[]) {
        state.filters.push({ op: 'in', column, value })
        return builder
      },
      is(column: string, value: unknown) {
        state.filters.push({ op: 'is', column, value })
        return builder
      },
      gte(column: string, value: unknown) {
        state.filters.push({ op: 'gte', column, value })
        return builder
      },
      range(fromIdx: number, toIdx: number) {
        state.range = [fromIdx, toIdx]
        return builder
      },
      then(onFulfilled: (value: { data: unknown; error: { message: string } | null }) => unknown, onRejected?: (reason: unknown) => unknown) {
        return Promise.resolve(execute()).then(onFulfilled, onRejected)
      },
    }

    function source(): Array<Record<string, unknown>> {
      if (table === 'tickets' && state.filters.some((filter) => filter.op === 'gte')) return opts?.volumeTickets ?? []
      if (table === 'tickets') return opts?.tickets ?? []
      if (table === 'maintenance_tasks') return opts?.tasks ?? []
      if (table === 'collection_charges') return opts?.charges ?? []
      return []
    }

    function execute() {
      calls.push({ table: state.table, action: state.action, filters: state.filters, payload: state.payload })
      if (state.action !== 'select') return { data: null, error: null }
      if (opts?.failSelect === table) return { data: null, error: { message: `${table} down` } }
      let data = source().filter((item) => matches(state.filters, item))
      if (opts?.repeatFullPages && state.range) {
        const seed = data[0] ?? { client_id: CLIENT_A, project_id: 'p1', created_at: '2026-10-20T00:00:00Z', deleted_at: null }
        data = Array.from({ length: 1000 }, () => seed)
      } else if (state.range) {
        const [start, end] = state.range
        data = data.slice(start, end + 1)
      }
      return { data, error: null }
    }

    return builder
  }

  return {
    from,
    calls,
    selects(table: string) {
      return calls.filter((call) => call.table === table && call.action === 'select')
    },
    updates() {
      return calls.filter((call) => call.action === 'update')
    },
  }
}

function clientEq(call: Recorded): string | undefined {
  return call.filters.find((filter) => filter.op === 'eq' && filter.column === 'client_id')?.value as string | undefined
}

describe('filterRelevantRecommendations', () => {
  it('drops closed, assigned, deleted, and done rows and keeps live ones', async () => {
    const admin = createAdmin({
      tickets: [
        { id: 'open', client_id: CLIENT_A, status: 'NEW', assigned_worker_id: null, deleted_at: null },
        { id: 'assigned', client_id: CLIENT_A, status: 'NEW', assigned_worker_id: 'worker-1', deleted_at: null },
        { id: 'closed', client_id: CLIENT_A, status: 'CLOSED', assigned_worker_id: null, deleted_at: null },
        { id: 'follow', client_id: CLIENT_A, status: 'IN_PROGRESS', assigned_worker_id: 'worker-1', deleted_at: null },
        { id: 'gone', client_id: CLIENT_A, status: 'NEW', assigned_worker_id: null, deleted_at: '2026-10-01T00:00:00Z' },
      ],
      tasks: [
        { id: 'late', client_id: CLIENT_A, status: 'PENDING', due_at: '2020-01-01T00:00:00Z', deleted_at: null },
        { id: 'done', client_id: CLIENT_A, status: 'DONE', due_at: '2020-01-01T00:00:00Z', deleted_at: null },
        { id: 'future', client_id: CLIENT_A, status: 'PENDING', due_at: '2027-01-01T00:00:00Z', deleted_at: null },
      ],
    })

    const kept = await filterRelevantRecommendations(
      admin as unknown as SupabaseClient,
      [
        row({ id: 'r-open', recommendation_type: 'sla_unassigned', entity_id: 'open' }),
        row({ id: 'r-assigned', recommendation_type: 'sla_unassigned', entity_id: 'assigned' }),
        row({ id: 'r-closed', recommendation_type: 'sla_unassigned', entity_id: 'closed' }),
        row({ id: 'r-follow', recommendation_type: 'professional_followup', entity_id: 'follow' }),
        row({ id: 'r-gone', recommendation_type: 'professional_forward_failed', entity_id: 'gone' }),
        row({ id: 'r-late', recommendation_type: 'maintenance_overdue', entity_id: 'late', entity_type: 'maintenance_task' }),
        row({ id: 'r-done', recommendation_type: 'maintenance_overdue', entity_id: 'done', entity_type: 'maintenance_task' }),
        row({ id: 'r-future', recommendation_type: 'maintenance_overdue', entity_id: 'future', entity_type: 'maintenance_task' }),
        row({ id: 'r-resolved', recommendation_type: 'sla_unassigned', entity_id: 'open', status: 'resolved' }),
        row({
          id: 'r-snooze',
          recommendation_type: 'sla_unassigned',
          entity_id: 'open',
          status: 'snoozed',
          snoozed_until: '2026-11-02T00:00:00Z',
        }),
      ],
      NOW
    )

    expect(kept.map((item) => item.id)).toEqual(['r-open', 'r-follow', 'r-late'])
    const resolvedIds = admin
      .updates()
      .filter((call) => (call.payload as { status?: string }).status === 'resolved')
      .flatMap((call) => call.filters.find((filter) => filter.column === 'id')?.value as string[])
    expect(resolvedIds.sort()).toEqual(['r-assigned', 'r-closed', 'r-done', 'r-future', 'r-gone'])
    expect(admin.updates().every((call) => clientEq(call) === CLIENT_A)).toBe(true)
  })

  it('uses one tickets read for many recommendations of the same tenant', async () => {
    const tickets = Array.from({ length: 8 }, (_, index) => ({
      id: `t-${index}`,
      client_id: CLIENT_A,
      status: 'NEW',
      assigned_worker_id: null,
      deleted_at: null,
    }))
    const admin = createAdmin({ tickets })
    const kept = await filterRelevantRecommendations(
      admin as unknown as SupabaseClient,
      tickets.map((ticket, index) =>
        row({ id: `r-${index}`, recommendation_type: 'sla_unassigned', entity_id: ticket.id })
      ),
      NOW
    )

    expect(kept).toHaveLength(8)
    expect(admin.selects('tickets')).toHaveLength(1)
    expect(admin.selects('maintenance_tasks')).toHaveLength(0)
    expect(admin.updates().filter((call) => call.table === 'management_recommendations')).toHaveLength(1)
  })

  it('does not treat another tenant ticket as relevant', async () => {
    const admin = createAdmin({
      tickets: [
        { id: 'shared', client_id: CLIENT_B, status: 'NEW', assigned_worker_id: null, deleted_at: null },
      ],
    })
    const kept = await filterRelevantRecommendations(
      admin as unknown as SupabaseClient,
      [row({ id: 'r-a', recommendation_type: 'sla_unassigned', entity_id: 'shared', client_id: CLIENT_A })],
      NOW
    )

    expect(kept).toEqual([])
    const ticketRead = admin.selects('tickets')[0]
    expect(clientEq(ticketRead!)).toBe(CLIENT_A)
    expect(admin.updates().every((call) => clientEq(call) === CLIENT_A)).toBe(true)
  })

  it('keeps each tenant on its own read when rows are mixed', async () => {
    const admin = createAdmin({
      tickets: [
        { id: 'a1', client_id: CLIENT_A, status: 'NEW', assigned_worker_id: null, deleted_at: null },
        { id: 'b1', client_id: CLIENT_B, status: 'CLOSED', assigned_worker_id: null, deleted_at: null },
      ],
    })
    const kept = await filterRelevantRecommendations(
      admin as unknown as SupabaseClient,
      [
        row({ id: 'r-a', recommendation_type: 'sla_unassigned', entity_id: 'a1', client_id: CLIENT_A }),
        row({ id: 'r-b', recommendation_type: 'sla_unassigned', entity_id: 'b1', client_id: CLIENT_B }),
      ],
      NOW
    )

    expect(kept.map((item) => item.id)).toEqual(['r-a'])
    expect(admin.selects('tickets').map(clientEq)).toEqual([CLIENT_A, CLIENT_B])
  })

  it('filters volume and collections in memory after one read each', async () => {
    const admin = createAdmin({
      volumeTickets: [
        { project_id: 'p1', client_id: CLIENT_A, created_at: '2026-10-20T00:00:00Z', deleted_at: null },
        { project_id: 'p1', client_id: CLIENT_A, created_at: '2026-10-21T00:00:00Z', deleted_at: null },
        { project_id: 'p1', client_id: CLIENT_B, created_at: '2026-10-22T00:00:00Z', deleted_at: null },
        { project_id: 'p1', client_id: CLIENT_A, created_at: '2026-08-01T00:00:00Z', deleted_at: null },
      ],
      charges: [
        { status: 'draft', project_id: 'p1', client_id: CLIENT_A },
        { status: 'sent', project_id: 'p9', client_id: CLIENT_A },
        { status: 'draft', project_id: 'p1', client_id: CLIENT_B },
      ],
    })
    const kept = await filterRelevantRecommendations(
      admin as unknown as SupabaseClient,
      [
        row({
          id: 'vol-low',
          recommendation_type: 'building_ticket_volume',
          entity_id: 'p1',
          entity_type: 'project',
          facts: { min_count: 7, window_days: 30 },
        }),
        row({
          id: 'topic-ok',
          recommendation_type: 'building_topic_recurrence',
          entity_id: 'p1',
          entity_type: 'project',
          facts: { min_count: 2, window_days: 30 },
        }),
        row({
          id: 'drafts',
          recommendation_type: 'collections_drafts',
          entity_id: 'p1',
          entity_type: 'collection_bucket',
        }),
        row({
          id: 'unpaid-empty',
          recommendation_type: 'collections_sent_unpaid',
          entity_id: 'p1',
          entity_type: 'collection_bucket',
        }),
      ],
      NOW
    )

    expect(kept.map((item) => item.id)).toEqual(['topic-ok', 'drafts'])
    expect(admin.selects('tickets')).toHaveLength(1)
    expect(admin.selects('collection_charges')).toHaveLength(1)
    expect(admin.selects('tickets').every((call) => clientEq(call) === CLIENT_A)).toBe(true)
  })

  it('does not resolve rows when the evidence read fails', async () => {
    const admin = createAdmin({ failSelect: 'tickets' })
    await expect(
      filterRelevantRecommendations(
        admin as unknown as SupabaseClient,
        [
          row({ id: 'r1', recommendation_type: 'sla_unassigned', entity_id: 't1' }),
          row({ id: 'r2', recommendation_type: 'sla_unassigned', entity_id: 't2' }),
        ],
        NOW
      )
    ).rejects.toBeInstanceOf(RecommendationValidationFetchError)
    expect(admin.updates()).toEqual([])
  })

  it('does not treat a truncated evidence page as an empty result', async () => {
    const admin = createAdmin({
      volumeTickets: [
        { project_id: 'p1', client_id: CLIENT_A, created_at: '2026-10-20T00:00:00Z', deleted_at: null },
      ],
      repeatFullPages: true,
    })
    await expect(
      filterRelevantRecommendations(
        admin as unknown as SupabaseClient,
        [
          row({
            id: 'vol',
            recommendation_type: 'building_ticket_volume',
            entity_id: 'p1',
            entity_type: 'project',
            facts: { min_count: 1, window_days: 30 },
          }),
        ],
        NOW
      )
    ).rejects.toBeInstanceOf(RecommendationValidationFetchError)
    expect(admin.updates()).toEqual([])
  })

  it('wakes an expired snooze that is still relevant without dropping it', async () => {
    const admin = createAdmin({
      tickets: [{ id: 'open', client_id: CLIENT_A, status: 'NEW', assigned_worker_id: null, deleted_at: null }],
    })
    const kept = await filterRelevantRecommendations(
      admin as unknown as SupabaseClient,
      [
        row({
          id: 'r-wake',
          recommendation_type: 'sla_unassigned',
          entity_id: 'open',
          status: 'snoozed',
          snoozed_until: '2026-10-01T00:00:00Z',
        }),
      ],
      NOW
    )
    expect(kept.map((item) => item.id)).toEqual(['r-wake'])
    const wake = admin.updates().find((call) => (call.payload as { status?: string }).status === 'active')
    expect(wake?.payload).toMatchObject({ status: 'active', snoozed_until: null })
    expect(clientEq(wake!)).toBe(CLIENT_A)
  })
})
