import { describe, expect, it } from 'vitest'
import { scoreGrowthLead } from '@/lib/growth/scoring'
import { buildDeterministicGrowthPlan, growthPlanSchema } from '@/lib/growth/brain-plan'
import { evaluateEnrollmentStop } from '@/lib/growth/outreach/stop-rules'
import { personalizeTemplate, BAMAKOR_OUTBOUND_SEQUENCES } from '@/lib/growth/outreach/sequences'
import {
  generateBamakorCreativeBatch,
  measureDiversity,
  BAMAKOR_HOOKS,
} from '@/lib/growth/creative/hooks'
import { buildFirstBamakorCampaignPack, campaignPackSchema } from '@/lib/growth/first-campaign'
import { verdictForArms } from '@/lib/growth/experiments/verdict'

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

describe('outreach stop rules + personalization', () => {
  it('stops on reply, opt-out, demo, invalid', () => {
    expect(
      evaluateEnrollmentStop({
        leadStatus: 'replied',
        optedOut: false,
        markedInvalid: false,
        replied: true,
        demoBooked: false,
        stopOnReply: true,
        stopOnOptOut: true,
        stopOnDemoBooked: true,
      }).stop
    ).toBe(true)
    expect(
      evaluateEnrollmentStop({
        leadStatus: 'qualified',
        optedOut: true,
        markedInvalid: false,
        replied: false,
        demoBooked: false,
        stopOnReply: true,
        stopOnOptOut: true,
        stopOnDemoBooked: true,
      })
    ).toMatchObject({ status: 'stopped_opt_out' })
    expect(
      evaluateEnrollmentStop({
        leadStatus: 'demo_booked',
        optedOut: false,
        markedInvalid: false,
        replied: false,
        demoBooked: true,
        stopOnReply: true,
        stopOnOptOut: true,
        stopOnDemoBooked: true,
      })
    ).toMatchObject({ status: 'stopped_demo' })
  })

  it('does not fabricate city when missing', () => {
    const text = personalizeTemplate('שלום{{contactGreeting}}, {{companyName}}{{cityClause}}.', {
      companyName: 'אלפא ניהול',
      contactName: null,
      city: null,
    })
    expect(text).toBe('שלום, אלפא ניהול.')
    expect(text.includes('באזור')).toBe(false)
  })

  it('ships 3 outbound sequence templates', () => {
    expect(BAMAKOR_OUTBOUND_SEQUENCES).toHaveLength(3)
    expect(BAMAKOR_OUTBOUND_SEQUENCES.every((s) => s.steps.length >= 2)).toBe(true)
  })
})

describe('creative diversity + first campaign pack', () => {
  it('generates 6 diverse concepts and 10 hooks', () => {
    const batch = generateBamakorCreativeBatch()
    expect(batch).toHaveLength(6)
    const d = measureDiversity(batch)
    expect(d.hooks.size).toBe(6)
    expect(d.pains.size).toBeGreaterThanOrEqual(4)
    expect(d.score).toBeGreaterThan(0.5)
    expect(BAMAKOR_HOOKS).toHaveLength(10)
  })

  it('first campaign pack is approval-only', () => {
    const pack = buildFirstBamakorCampaignPack()
    expect(campaignPackSchema.safeParse(pack).success).toBe(true)
    expect(pack.autoLaunch).toBe(false)
    expect(pack.status).toBe('pending_approval')
    expect(pack.metaAdConcepts).toHaveLength(6)
    expect(pack.outboundSequences).toHaveLength(3)
    expect(pack.offers).toHaveLength(2)
    expect(pack.recommendedTestBudgetIls).toBe(3000)
  })
})

describe('experiment verdict', () => {
  it('is inconclusive without enough data', () => {
    const r = verdictForArms([
      { key: 'a', metrics: { spend: 50, leads: 1, qualified: 0, demos: 0 } },
      { key: 'b', metrics: { spend: 40, leads: 0, qualified: 0, demos: 0 } },
    ])
    expect(r.verdict).toBe('inconclusive')
  })

  it('picks winner when demos/₪ clearly ahead', () => {
    const r = verdictForArms([
      { key: 'chaos', metrics: { spend: 500, leads: 10, qualified: 6, demos: 4 } },
      { key: 'cost', metrics: { spend: 500, leads: 8, qualified: 3, demos: 1 } },
    ])
    expect(r.verdict).toBe('winner')
    expect(r.winnerKey).toBe('chaos')
  })
})
