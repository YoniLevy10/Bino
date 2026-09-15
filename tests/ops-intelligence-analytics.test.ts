import { describe, expect, it } from 'vitest'
import {
  avg,
  buildLearnings,
  buildOpsIntelligenceFromStats,
  buildSuggestions,
  hoursBetween,
  median,
  pct,
  type OpsIntelligenceReport,
} from '@/lib/ops-intelligence-analytics'

describe('ops-intelligence helpers', () => {
  it('hoursBetween / median / avg / pct', () => {
    expect(hoursBetween('2026-01-01T00:00:00.000Z', '2026-01-01T12:00:00.000Z')).toBe(12)
    expect(median([1, 3, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(avg([2, 4])).toBe(3)
    expect(pct(1, 4)).toBe(25)
    expect(pct(0, 0)).toBe(0)
  })
})

describe('buildOpsIntelligenceFromStats', () => {
  it('computes north-star proxies and suggestions from sample tickets', () => {
    const report = buildOpsIntelligenceFromStats({
      lookbackDays: 90,
      ticketsAllActive: [
        {
          id: 't1',
          client_id: 'c1',
          project_id: 'p1',
          status: 'CLOSED',
          created_at: '2026-08-01T10:00:00.000Z',
          closed_at: '2026-08-02T10:00:00.000Z',
          assigned_worker_id: 'w1',
          reporter_phone: '972501111111',
          is_recurring: true,
          sla_alerted: true,
          escalated_at: null,
          source: 'whatsapp',
          source_channel: null,
          ticket_metadata: {},
        },
        {
          id: 't2',
          client_id: 'c1',
          project_id: 'p1',
          status: 'CLOSED',
          created_at: '2026-08-05T10:00:00.000Z',
          closed_at: '2026-08-05T16:00:00.000Z',
          assigned_worker_id: 'w1',
          reporter_phone: '972501111111',
          is_recurring: false,
          sla_alerted: false,
          escalated_at: null,
          source: 'whatsapp',
          source_channel: null,
          ticket_metadata: {},
        },
        {
          id: 't3',
          client_id: 'c1',
          project_id: 'p1',
          status: 'NEW',
          created_at: '2026-08-10T10:00:00.000Z',
          closed_at: null,
          assigned_worker_id: null,
          reporter_phone: '972501111111',
          is_recurring: false,
          sla_alerted: false,
          escalated_at: null,
          source: 'whatsapp',
          source_channel: null,
          ticket_metadata: {},
        },
      ],
      ticketsInWindow: [
        {
          id: 't1',
          client_id: 'c1',
          project_id: 'p1',
          status: 'CLOSED',
          created_at: '2026-08-01T10:00:00.000Z',
          closed_at: '2026-08-02T10:00:00.000Z',
          assigned_worker_id: 'w1',
          reporter_phone: '972501111111',
          is_recurring: true,
          sla_alerted: true,
          escalated_at: null,
          source: 'whatsapp',
          source_channel: null,
          ticket_metadata: {},
        },
        {
          id: 't2',
          client_id: 'c1',
          project_id: 'p1',
          status: 'CLOSED',
          created_at: '2026-08-05T10:00:00.000Z',
          closed_at: '2026-08-05T16:00:00.000Z',
          assigned_worker_id: 'w1',
          reporter_phone: '972501111111',
          is_recurring: false,
          sla_alerted: false,
          escalated_at: null,
          source: 'whatsapp',
          source_channel: null,
          ticket_metadata: {},
        },
        {
          id: 't3',
          client_id: 'c1',
          project_id: 'p1',
          status: 'NEW',
          created_at: '2026-08-10T10:00:00.000Z',
          closed_at: null,
          assigned_worker_id: null,
          reporter_phone: '972501111111',
          is_recurring: false,
          sla_alerted: false,
          escalated_at: null,
          source: 'whatsapp',
          source_channel: null,
          ticket_metadata: {},
        },
      ],
      logs: [
        {
          ticket_id: 't1',
          action_type: 'ASSIGNED_TO_WORKER',
          created_at: '2026-08-01T11:00:00.000Z',
          meta: { auto_from_project: true },
        },
        {
          ticket_id: 't2',
          action_type: 'ASSIGNED_TO_WORKER',
          created_at: '2026-08-05T12:00:00.000Z',
          meta: { auto_from_project: false },
        },
      ],
      clients: [{ id: 'c1', name: 'Bamakor' }],
      projects: [{ id: 'p1', name: 'בניין א', client_id: 'c1', assigned_worker_id: 'w1' }],
      residentsCount: 100,
      workersCount: 5,
      professionalsCount: 0,
      ticketLogsCount: 10,
    })

    expect(report.inventory.tickets_in_window).toBe(3)
    expect(report.north_star.avg_hours_to_resolution).toBe(15)
    expect(report.north_star.assignment_coverage_pct).toBe(66.7)
    expect(report.north_star.auto_assign_pct).toBe(50)
    expect(report.north_star.recurring_count).toBe(1)
    expect(report.repeat_reporters[0]?.tickets).toBe(3)
    expect(report.learnings.length).toBeGreaterThan(3)
    expect(report.suggestions.some((s) => s.id === 'wire-preventive-cron')).toBe(true)
    expect(report.suggestions.some((s) => s.id === 'seed-professionals')).toBe(true)
    expect(report.inventory.data_gaps.some((g) => g.key === 'cost' && g.status === 'missing')).toBe(true)
  })
})

describe('buildLearnings / buildSuggestions', () => {
  it('returns no-data learning when window empty', () => {
    const ns = {
      avg_hours_to_assignment: null,
      median_hours_to_assignment: null,
      assignment_sample_size: 0,
      assignment_coverage_pct: 0,
      auto_assign_pct: null,
      auto_assign_sample_size: 0,
      avg_hours_to_resolution: null,
      median_hours_to_resolution: null,
      resolution_sample_size: 0,
      recurring_rate_pct: 0,
      recurring_count: 0,
      sla_alert_rate_pct: 0,
      sla_alerted_count: 0,
      escalation_rate_pct: 0,
      escalated_count: 0,
      maintenance_cost_available: false,
      without_manager_proxy_pct: null,
    } satisfies OpsIntelligenceReport['north_star']

    const learnings = buildLearnings({
      windowN: 0,
      north_star: ns,
      hot_buildings: [],
      repeat_reporters: [],
      by_source: [],
      buildingsWithDefaultWorker: 0,
      projectsCount: 0,
      professionalsCount: 0,
      withMetadata: 0,
    })
    expect(learnings[0]?.id).toBe('no-data')

    const suggestions = buildSuggestions({
      windowN: 0,
      north_star: ns,
      hot_buildings: [],
      repeat_reporters: [],
      buildingsWithDefaultWorker: 0,
      projectsCount: 2,
      professionalsCount: 0,
      withMetadata: 0,
      data_gaps: [],
    })
    expect(suggestions[0]?.priority).toBe('high')
  })
})
