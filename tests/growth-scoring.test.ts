import { describe, expect, it } from 'vitest'
import { scoreGrowthLead } from '@/lib/growth/scoring'
import { buildDeterministicGrowthPlan, growthPlanSchema } from '@/lib/growth/brain-plan'

describe('growth scoring + brain plan', () => {
  it('scores HOT when multiple strong signals present', () => {
    const r = scoreGrowthLead({
      managesMultipleBuildings: true,
      relevantPmcCategory: true,
      operationalContactFound: true,
      activeWebsite: true,
      visibleMaintenanceOps: true,
      whatsappOrPublicContact: true,
      geographicFitIsrael: true,
    })
    expect(r.score).toBe(100)
    expect(r.band).toBe('hot')
    expect(r.reasons.length).toBeGreaterThanOrEqual(6)
  })

  it('does not invent buildings signal without data', () => {
    const r = scoreGrowthLead({
      relevantPmcCategory: true,
      geographicFitIsrael: true,
    })
    expect(r.reasons.some((x) => x.code === 'multi_building')).toBe(false)
    expect(r.band).toBe('cold')
  })

  it('builds approval-required growth plan', () => {
    const plan = buildDeterministicGrowthPlan({
      title: '10 demos from Israeli PMCs',
      targetDemos: 10,
      windowDays: 14,
      maxBudget: 3000,
    })
    expect(growthPlanSchema.safeParse(plan).success).toBe(true)
    expect(plan.requiresApproval).toBe(true)
    expect(plan.channels.some((c) => c.channel === 'meta_ads')).toBe(true)
  })
})
