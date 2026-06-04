import type { SupabaseClient } from '@supabase/supabase-js'
import { PLAN_LIMITS, PLAN_PRICES, type PlanTier, normalizeTier } from '@/lib/plan-limits'

export type PlanPricingCatalogRow = {
  plan_tier: string
  name_he: string
  description_he: string | null
  price_ils_monthly: number | null
  price_display_he: string | null
  buildings_max: number | null
  workers_max: number | null
  tickets_per_month_max: number | null
  sort_order: number
  is_active: boolean
}

export type BillingPlatformSettings = {
  setup_fee_ils: number
}

export function formatPlanPriceIls(price: number): string {
  return `₪${price.toLocaleString('he-IL')}`
}

export function formatLimitHe(value: number | null | undefined): string {
  if (value == null) return 'ללא הגבלה'
  return value.toLocaleString('he-IL')
}

/** Display string for monthly price (DB row or code fallback). */
export function formatPlanPriceDisplay(row: {
  plan_tier: string
  price_ils_monthly?: number | null
  price_display_he?: string | null
}): string {
  const custom = row.price_display_he?.trim()
  if (custom) return custom
  if (row.price_ils_monthly != null && Number.isFinite(row.price_ils_monthly)) {
    return `${formatPlanPriceIls(row.price_ils_monthly)}/חודש`
  }
  return PLAN_PRICES[normalizeTier(row.plan_tier)] ?? 'מחיר מותאם'
}

function fallbackCatalogRow(tier: PlanTier): PlanPricingCatalogRow {
  const lim = PLAN_LIMITS[tier]
  const buildings = lim.buildings === Infinity ? null : lim.buildings
  const workers = lim.workers === Infinity ? null : lim.workers
  const tickets = lim.tickets_per_month === Infinity ? null : lim.tickets_per_month
  const priceStr = PLAN_PRICES[tier]
  const priceMatch = priceStr.match(/(\d+)/)
  const price = tier === 'enterprise' ? null : priceMatch ? parseInt(priceMatch[1], 10) : null

  const labels: Record<PlanTier, { name: string; desc: string }> = {
    starter: { name: 'Starter', desc: 'עד 3 בניינים' },
    pro: { name: 'Pro', desc: 'עד 10 בניינים' },
    business: { name: 'Business', desc: 'עד 30 בניינים' },
    enterprise: { name: 'Enterprise', desc: 'ללא הגבלת בניינים' },
  }

  return {
    plan_tier: tier,
    name_he: labels[tier].name,
    description_he: labels[tier].desc,
    price_ils_monthly: price,
    price_display_he: tier === 'enterprise' ? priceStr : null,
    buildings_max: buildings,
    workers_max: workers,
    tickets_per_month_max: tickets,
    sort_order: { starter: 10, pro: 20, business: 30, enterprise: 40 }[tier],
    is_active: true,
  }
}

const ALL_TIERS: PlanTier[] = ['starter', 'pro', 'business', 'enterprise']

export function fallbackPlanPricingCatalog(): PlanPricingCatalogRow[] {
  return ALL_TIERS.map(fallbackCatalogRow)
}

export async function listActivePlanPricing(
  supabase: SupabaseClient
): Promise<PlanPricingCatalogRow[]> {
  const { data, error } = await supabase
    .from('plan_pricing_catalog')
    .select(
      'plan_tier, name_he, description_he, price_ils_monthly, price_display_he, buildings_max, workers_max, tickets_per_month_max, sort_order, is_active'
    )
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) {
    if (error.code === 'PGRST200' || error.code === '42P01') return fallbackPlanPricingCatalog()
    throw error
  }
  const rows = (data as PlanPricingCatalogRow[]) || []
  return rows.length > 0 ? rows : fallbackPlanPricingCatalog()
}

export async function listAllPlanPricingAdmin(
  supabase: SupabaseClient
): Promise<PlanPricingCatalogRow[]> {
  const { data, error } = await supabase
    .from('plan_pricing_catalog')
    .select(
      'plan_tier, name_he, description_he, price_ils_monthly, price_display_he, buildings_max, workers_max, tickets_per_month_max, sort_order, is_active'
    )
    .order('sort_order', { ascending: true })

  if (error) {
    if (error.code === 'PGRST200' || error.code === '42P01') return fallbackPlanPricingCatalog()
    throw error
  }
  const rows = (data as PlanPricingCatalogRow[]) || []
  return rows.length > 0 ? rows : fallbackPlanPricingCatalog()
}

export async function getPlanPricingRow(
  supabase: SupabaseClient,
  planTier: string
): Promise<PlanPricingCatalogRow | null> {
  const tier = normalizeTier(planTier)
  const { data, error } = await supabase
    .from('plan_pricing_catalog')
    .select(
      'plan_tier, name_he, description_he, price_ils_monthly, price_display_he, buildings_max, workers_max, tickets_per_month_max, sort_order, is_active'
    )
    .eq('plan_tier', tier)
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST200' || error.code === '42P01') return fallbackCatalogRow(tier)
    throw error
  }
  return (data as PlanPricingCatalogRow | null) ?? fallbackCatalogRow(tier)
}

const DEFAULT_SETUP_FEE = 10_000

export async function getBillingPlatformSettings(
  supabase: SupabaseClient
): Promise<BillingPlatformSettings> {
  const { data, error } = await supabase
    .from('billing_platform_settings')
    .select('setup_fee_ils')
    .eq('id', 'default')
    .maybeSingle()

  if (error) {
    if (error.code === 'PGRST200' || error.code === '42P01') return { setup_fee_ils: DEFAULT_SETUP_FEE }
    throw error
  }
  const fee = (data as { setup_fee_ils?: number } | null)?.setup_fee_ils
  return { setup_fee_ils: typeof fee === 'number' && fee >= 0 ? fee : DEFAULT_SETUP_FEE }
}
