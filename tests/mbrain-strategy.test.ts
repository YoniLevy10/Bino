import { describe, expect, it } from 'vitest'
import { buildDeterministicCampaignPlan } from '@/lib/mbrain/agents/marketing-director'
import { campaignPlanSchema } from '@/lib/mbrain/strategy-schema'

describe('marketing director strategy', () => {
  it('builds a Zod-valid structured plan from Bamakor brand brain', () => {
    const plan = buildDeterministicCampaignPlan(
      {
        id: 'o1',
        title: 'Generate qualified leads from Israeli property management companies',
        goal_type: 'qualified_leads',
        target_count: 20,
        max_cpl: 150,
        total_budget: 3000,
        daily_budget: 100,
        market: 'IL',
        audience: 'Property management companies',
        product_name: 'Bamakor',
        currency: 'ILS',
        raw_brief: null,
      },
      {
        brand: {
          id: 'b1000000-0000-4000-8000-000000000001',
          name: 'במקור',
          website: 'https://bamakor.vercel.app',
          market: 'IL',
        },
        profile: {
          product_description: 'SaaS',
          target_customers: 'PMCs',
          customer_pains: ['WhatsApp chaos'],
          value_propositions: ['Central ops'],
          differentiators: ['Hebrew WhatsApp'],
          icps: [{ name: 'PMC manager', status: 'hypothesis' }],
          brand_voice: {},
          prohibited_claims: [],
        },
        hypotheses: [
          {
            id: 'h1',
            title: 'WhatsApp is not a CMMS',
            statement: 'Chat is not a system',
            creative_angle: 'Your maintenance department should not live inside WhatsApp.',
            target_pain: 'WhatsApp chaos',
          },
        ],
      }
    )

    expect(campaignPlanSchema.safeParse(plan).success).toBe(true)
    expect(plan.campaignObjective).toBe('OUTCOME_LEADS')
    expect(plan.successMetrics.targetCpl).toBe(150)
    expect(plan.creativeAngles[0]?.hook).toContain('WhatsApp')
  })
})
