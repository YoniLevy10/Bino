import { describe, expect, it } from 'vitest'
import { summarizeTicketMemory } from '@/lib/mobile-ticket-memory'

describe('summarizeTicketMemory', () => {
  it('counts open, unassigned, and recurring tickets', () => {
    const summary = summarizeTicketMemory([
      {
        status: 'NEW',
        assignedWorkerId: null,
        isRecurring: true,
        createdAt: '2026-11-01T08:00:00.000Z',
        closedAt: null,
      },
      {
        status: 'IN_PROGRESS',
        assignedWorkerId: 'worker-1',
        isRecurring: false,
        createdAt: '2026-11-01T08:00:00.000Z',
        closedAt: null,
      },
      {
        status: 'CLOSED',
        assignedWorkerId: 'worker-1',
        isRecurring: false,
        createdAt: '2026-11-01T08:00:00.000Z',
        closedAt: '2026-11-01T12:00:00.000Z',
      },
    ])
    expect(summary.open).toBe(2)
    expect(summary.unassigned).toBe(1)
    expect(summary.recurringOpen).toBe(1)
    expect(summary.recurringRate).toBe(0.5)
    expect(summary.medianResolutionHours).toBe(4)
  })

  it('returns empty rates when there are no open tickets', () => {
    const summary = summarizeTicketMemory([])
    expect(summary.open).toBe(0)
    expect(summary.recurringRate).toBeNull()
    expect(summary.medianResolutionHours).toBeNull()
  })
})
