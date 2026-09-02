/**
 * Levy Marketing Brain — domain types & Zod schemas (Phase A)
 */
import { z } from 'zod'

export const autonomyModeSchema = z.enum(['manual', 'supervised', 'autonomous'])
export type AutonomyMode = z.infer<typeof autonomyModeSchema>

export const mbrainMemberRoleSchema = z.enum(['owner', 'admin', 'analyst', 'viewer'])
export type MbrainMemberRole = z.infer<typeof mbrainMemberRoleSchema>

export const brandStatusSchema = z.enum(['draft', 'active', 'archived'])

export const icpSchema = z.object({
  name: z.string().min(1),
  geography: z.string().optional(),
  status: z.enum(['hypothesis', 'validated', 'rejected']).default('hypothesis'),
  notes: z.string().optional(),
})

export const brandProfileUpdateSchema = z.object({
  product_description: z.string().nullable().optional(),
  target_customers: z.string().nullable().optional(),
  geographic_markets: z.array(z.string()).optional(),
  pricing: z.record(z.string(), z.unknown()).optional(),
  value_propositions: z.array(z.string()).optional(),
  customer_pains: z.array(z.string()).optional(),
  competitors: z.array(z.string()).optional(),
  differentiators: z.array(z.string()).optional(),
  brand_voice: z.record(z.string(), z.unknown()).optional(),
  prohibited_claims: z.array(z.string()).optional(),
  icps: z.array(icpSchema).optional(),
  testimonials: z.array(z.unknown()).optional(),
  landing_pages: z.array(z.string().url()).optional(),
  onboarding_completed_at: z.string().datetime().nullable().optional(),
})

export const createBrandSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug חייב להיות באנגלית קטנה עם מקפים'),
  website: z.string().url().optional().nullable(),
  market: z.string().default('IL'),
  locale: z.string().default('he-IL'),
})

export const bootstrapMembershipSchema = z.object({
  /** Optional invite secret for first-owner bootstrap in empty envs */
  setupSecret: z.string().optional(),
})

export const BAMAKOR_BRAND_ID = 'b1000000-0000-4000-8000-000000000001'
export const LEVY_ORG_ID = 'a1000000-0000-4000-8000-000000000001'

export type MbrainOrganization = {
  id: string
  name: string
  slug: string
  autonomy_mode: AutonomyMode
  is_active: boolean
}

export type MbrainBrand = {
  id: string
  organization_id: string
  name: string
  slug: string
  website: string | null
  locale: string
  market: string
  status: z.infer<typeof brandStatusSchema>
}

export type MbrainBrandProfile = {
  id: string
  brand_id: string
  product_description: string | null
  target_customers: string | null
  geographic_markets: string[]
  value_propositions: string[]
  customer_pains: string[]
  differentiators: string[]
  brand_voice: Record<string, unknown>
  prohibited_claims: string[]
  icps: z.infer<typeof icpSchema>[]
  onboarding_completed_at: string | null
}

export type MbrainHypothesis = {
  id: string
  brand_id: string
  title: string
  statement: string
  creative_angle: string
  target_pain: string | null
  target_persona: string | null
  status: string
  sort_order: number
}
