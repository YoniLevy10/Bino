import { describe, expect, it } from 'vitest'
import {
  EMPTY_DASHBOARD_TICKET_KPI_COUNTS,
  resolveDashboardTicketKpiCounts,
} from '@/lib/dashboard-ticket-kpi-counts'

describe('resolveDashboardTicketKpiCounts', () => {
  it('prefers stored ticketKpis', () => {
    expect(
      resolveDashboardTicketKpiCounts({
        ticketKpis: { active: 12, open: 3, inProgress: 9, closed: 40 },
        closedCount: 1,
        tickets: [{ status: 'NEW' }],
      })
    ).toEqual({ active: 12, open: 3, inProgress: 9, closed: 40 })
  })

  it('falls back to closedCount + open list for legacy cache', () => {
    expect(
      resolveDashboardTicketKpiCounts({
        closedCount: 78,
        tickets: [{ status: 'NEW' }, { status: 'IN_PROGRESS' }, { status: 'ASSIGNED' }],
      })
    ).toEqual({ active: 3, open: 1, inProgress: 2, closed: 78 })
  })

  it('returns zeros when empty', () => {
    expect(resolveDashboardTicketKpiCounts({})).toEqual(EMPTY_DASHBOARD_TICKET_KPI_COUNTS)
  })
})
