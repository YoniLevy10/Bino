/**
 * Structured Campaign Plan — Zod validated. Downstream never depends on prose.
 */
import { z } from 'zod'

export const marketingObjectiveInputSchema = z.object({
  brandId: z.string().uuid(),
  title: z.string().min(3).max(200),
  goalType: z
    .enum(['qualified_leads', 'demos', 'traffic', 'awareness', 'custom'])
    .default('qualified_leads'),
  targetCount: z.number().int().positive().optional(),
  maxCpl: z.number().positive().optional(),
  totalBudget: z.number().positive().optional(),
  dailyBudget: z.number().positive().optional(),
  market: z.string().default('IL'),
  audience: z.string().optional(),
  productName: z.string().optional(),
  currency: z.string().default('ILS'),
  rawBrief: z.string().optional(),
})

export const campaignPlanSchema = z.object({
  objective: z.string().min(1),
  idealCustomerProfile: z.object({
    name: z.string(),
    description: z.string(),
    geography: z.string(),
    decisionCriteria: z.array(z.string()).default([]),
  }),
  painPoints: z.array(z.string()).min(1),
  offers: z.array(z.string()).min(1),
  positioning: z.string().min(1),
  funnel: z.object({
    stages: z.array(z.string()).min(1),
    primaryConversion: z.string(),
    landingPageRole: z.string(),
  }),
  campaignObjective: z.enum([
    'OUTCOME_LEADS',
    'OUTCOME_TRAFFIC',
    'OUTCOME_AWARENESS',
    'OUTCOME_ENGAGEMENT',
    'OUTCOME_SALES',
  ]),
  audienceHypotheses: z
    .array(
      z.object({
        name: z.string(),
        targetingIdea: z.string(),
        rationale: z.string(),
      })
    )
    .min(1),
  creativeAngles: z
    .array(
      z.object({
        hypothesisId: z.string().optional(),
        angle: z.string(),
        hook: z.string(),
        whyItMightWork: z.string(),
      })
    )
    .min(1),
  copyAngles: z
    .array(
      z.object({
        angle: z.string(),
        primaryTextIdea: z.string(),
        headlineIdea: z.string(),
      })
    )
    .min(1),
  budget: z.object({
    currency: z.string(),
    daily: z.number().nonnegative().optional(),
    monthly: z.number().nonnegative().optional(),
    allocationNotes: z.string(),
  }),
  testingPlan: z.object({
    variables: z.array(z.string()),
    minDataBeforeJudge: z.string(),
    sequence: z.array(z.string()),
  }),
  successMetrics: z.object({
    primary: z.string(),
    secondary: z.array(z.string()),
    targetCpl: z.number().nullable().optional(),
    targetLeads: z.number().nullable().optional(),
  }),
  stopConditions: z.array(z.string()).min(1),
  optimizationRules: z.array(z.string()).min(1),
  risks: z.array(z.string()).default([]),
})

export type CampaignPlan = z.infer<typeof campaignPlanSchema>
export type MarketingObjectiveInput = z.infer<typeof marketingObjectiveInputSchema>
