import { beforeEach, describe, expect, it, vi } from 'vitest'

const detectSlaUnassigned = vi.fn()
const detectMaintenanceOverdue = vi.fn()
const detectProfessionalFollowup = vi.fn()
const detectBuildingVolumeAndTopics = vi.fn()
const detectCollectionsFollowup = vi.fn()
const upsertRecommendation = vi.fn()
const recordRecommendationEvent = vi.fn()

vi.mock('@/lib/recommendations/detectors/sla-unassigned', () => ({
  detectSlaUnassigned: (...args: unknown[]) => detectSlaUnassigned(...args),
}))
vi.mock('@/lib/recommendations/detectors/maintenance-overdue', () => ({
  detectMaintenanceOverdue: (...args: unknown[]) => detectMaintenanceOverdue(...args),
}))
vi.mock('@/lib/recommendations/detectors/professional-followup', () => ({
  detectProfessionalFollowup: (...args: unknown[]) => detectProfessionalFollowup(...args),
}))
vi.mock('@/lib/recommendations/detectors/building-volume', () => ({
  detectBuildingVolumeAndTopics: (...args: unknown[]) => detectBuildingVolumeAndTopics(...args),
}))
vi.mock('@/lib/recommendations/detectors/collections', () => ({
  detectCollectionsFollowup: (...args: unknown[]) => detectCollectionsFollowup(...args),
}))
vi.mock('@/lib/recommendations/upsert-recommendation', () => ({
  upsertRecommendation: (...args: unknown[]) => upsertRecommendation(...args),
}))
vi.mock('@/lib/recommendations/record-event', () => ({
  recordRecommendationEvent: (...args: unknown[]) => recordRecommendationEvent(...args),
}))

import { runClientDetectors } from '@/lib/recommendations/run-client-detectors'

describe('runClientDetectors isolation', () => {
  const from = vi.fn()
  const admin = { from }

  beforeEach(() => {
    vi.clearAllMocks()
    detectSlaUnassigned.mockResolvedValue([])
    detectMaintenanceOverdue.mockResolvedValue([])
    detectProfessionalFollowup.mockResolvedValue([])
    detectBuildingVolumeAndTopics.mockResolvedValue([
      {
        recommendationType: 'building_ticket_volume',
        entityType: 'project',
        entityId: 'p1',
        dedupeKey: 'building_ticket_volume:p1',
        urgency: 'medium',
        reason: 'test',
        facts: {},
        primaryAction: 'view_tickets',
        primaryActionHref: '/tickets',
        actions: [],
      },
    ])
    detectCollectionsFollowup.mockRejectedValue({
      message: 'AbortError: This operation was aborted',
      code: '',
      details: '',
      hint: 'timeout',
    })
    upsertRecommendation.mockResolvedValue('rec-1')
    from.mockImplementation(() => {
      const chain: Record<string, unknown> = {}
      const self = () => chain
      chain.select = vi.fn(self)
      chain.eq = vi.fn(self)
      chain.in = vi.fn(self)
      chain.update = vi.fn(self)
      chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null })
      return chain
    })
  })

  it('completes scan when collections detector throws a plain object', async () => {
    const result = await runClientDetectors(admin as never, 'client-1')
    expect(result.drafts).toBe(1)
    expect(result.upserted).toBe(1)
    expect(upsertRecommendation).toHaveBeenCalled()
  })
})
