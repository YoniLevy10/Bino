import { describe, expect, it } from 'vitest'
import { synthesizeOpsBriefing } from '@/lib/ops-context/synthesize-briefing'
import type { TenantOpsSnapshot } from '@/lib/ops-context/tenant-snapshot'

function emptySnapshot(over: Partial<TenantOpsSnapshot> = {}): TenantOpsSnapshot {
  return {
    clientId: 'c1',
    generatedAt: new Date().toISOString(),
    tickets: { open: 0, unassigned: 0, recurringOpen: 0, agingUnassigned: 0 },
    maintenance: { overdue: 0 },
    collections: {
      enabled: false,
      drafts: 0,
      sendFailed: 0,
      sentUnpaid: 0,
      growBuildingsTotal: 0,
      growBuildingsReady: 0,
      growBuildingsMissing: 0,
    },
    hotProjects: [],
    ...over,
  }
}

describe('synthesizeOpsBriefing', () => {
  it('returns quiet when nothing is wrong', () => {
    const b = synthesizeOpsBriefing(emptySnapshot())
    expect(b.quiet).toBe(true)
    expect(b.priorities).toHaveLength(0)
  })

  it('joins tickets + grow into one conclusion', () => {
    const b = synthesizeOpsBriefing(
      emptySnapshot({
        tickets: { open: 8, unassigned: 2, recurringOpen: 3, agingUnassigned: 2 },
        collections: {
          enabled: true,
          drafts: 0,
          sendFailed: 0,
          sentUnpaid: 1,
          growBuildingsTotal: 4,
          growBuildingsReady: 1,
          growBuildingsMissing: 3,
        },
        hotProjects: [
          { id: 'p1', name: 'הרצל 12', openTickets: 5, recurringOpen: 2 },
        ],
      })
    )
    expect(b.quiet).toBe(false)
    expect(b.domains).toEqual(expect.arrayContaining(['tickets', 'grow', 'building']))
    expect(b.summary).toMatch(/מסקנה מכל המסכים/)
    expect(b.priorities.length).toBeGreaterThan(1)
  })
})
