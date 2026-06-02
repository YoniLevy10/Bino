import { PLAN_LIMITS, PLAN_PRICES, type PlanTier } from '@/lib/plan-limits'

export function formatPlanQuota(value: number): string {
  return value === Infinity ? 'ללא הגבלה' : value.toLocaleString('he-IL')
}

export function planLimitsLine(tier: PlanTier): string {
  const lim = PLAN_LIMITS[tier]
  return `${formatPlanQuota(lim.buildings)} בניינים · ${formatPlanQuota(lim.workers)} עובדים · ${formatPlanQuota(lim.tickets_per_month)} תקלות/חודש`
}

export function planPriceLabel(tier: PlanTier): string {
  return `${PLAN_PRICES[tier]}/חודש`
}

export const PLAN_TIER_ORDER: PlanTier[] = ['starter', 'pro', 'business', 'enterprise']

export const PLAN_SETUP_OPTIONS: { value: PlanTier; label: string }[] = PLAN_TIER_ORDER.map((tier) => ({
  value: tier,
  label: `${tier.charAt(0).toUpperCase()}${tier.slice(1)} — ${PLAN_PRICES[tier]}/חודש (${formatPlanQuota(PLAN_LIMITS[tier].buildings)} בניינים)`,
}))

export const PLAN_HEBREW_LABELS: Record<PlanTier, string> = {
  starter: 'Starter',
  pro: 'Pro',
  business: 'Business',
  enterprise: 'Enterprise',
}
