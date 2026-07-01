/**
 * lib/plan-limits.ts — הגדרות מסלולים ומגבלות
 *
 * @description
 * מגדיר את 4 מסלולי המחיר (starter / pro / business / enterprise)
 * עם מגבלות per-plan על בניינים, עובדים, ותקלות לחודש.
 * normalizeTier() ממיר ערכים ישנים ('basic', null) ל-'starter'.
 * getClientPlanRow() שולף את שורת הלקוח מ-DB עם כל מגבלות ה-override.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * ארבעה מסלולים:
 *  starter   ₪299/חודש — נקודת כניסה
 *  pro       ₪499/חודש — הכי נפוץ (מסומן)
 *  business  ₪699/חודש — חברות בינוניות
 *  enterprise ₪899+/חודש — ללא מגבלה
 *
 * כל המספרים ניתנים לדריסה per-client ע"י עמודות buildings_allowed / max_workers / max_tickets_per_month.
 * null = ללא מגבלה קשה בלוגיקת ה-API.
 */
export const PLAN_LIMITS = {
  starter:    { buildings: 3,        workers: 5,        tickets_per_month: 300 },
  pro:        { buildings: 10,       workers: 20,       tickets_per_month: 1_000 },
  business:   { buildings: 30,       workers: 60,       tickets_per_month: 5_000 },
  enterprise: { buildings: Infinity, workers: Infinity, tickets_per_month: Infinity },
} as const

export type PlanTier = keyof typeof PLAN_LIMITS

/** מחירון לתצוגה (₪/חודש). enterprise = "מחיר מותאם". */
export const PLAN_PRICES: Record<PlanTier, string> = {
  starter:    '₪299',
  pro:        '₪499',
  business:   '₪699',
  enterprise: '₪899+',
}

export type ClientPlanRow = {
  id: string
  plan_tier?: string | null
  buildings_allowed?: number | null
  max_workers?: number | null
  max_tickets_per_month?: number | null
}

/** Limits from plan_pricing_catalog (Super Admin editable). Used when client has no per-row override. */
export type PlanCatalogLimits = {
  buildings_max?: number | null
  workers_max?: number | null
  tickets_per_month_max?: number | null
}

function positiveLimit(value: number | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  return null
}

/** ממפה ערכים ישנים ('basic') וערכים לא מוכרים ל-starter. */
export function normalizeTier(tier: string | null | undefined): PlanTier {
  if (tier === 'pro' || tier === 'business' || tier === 'enterprise') return tier
  // 'basic' (ישן) ו-null → starter
  return 'starter'
}

/** Single row for quota checks (create-project / create-worker / onboarding). */
export async function getClientPlanRow(supabase: SupabaseClient, clientId: string) {
  return supabase
    .from('clients')
    .select('id, plan_tier, buildings_allowed, max_workers, max_tickets_per_month')
    .eq('id', clientId)
    .maybeSingle()
}

/**
 * Max active buildings (projects). `null` = no hard cap.
 * DB `buildings_allowed` overrides plan defaults when set.
 */
export function effectiveMaxBuildings(
  client: ClientPlanRow | null,
  catalog?: PlanCatalogLimits | null
): number | null {
  if (!client) return null
  const fromDb = positiveLimit(client.buildings_allowed)
  if (fromDb != null) return fromDb
  const fromCatalog = positiveLimit(catalog?.buildings_max)
  if (fromCatalog != null) return fromCatalog
  const lim = PLAN_LIMITS[normalizeTier(client.plan_tier)].buildings
  return lim === Infinity ? null : lim
}

/** Max active workers. `null` = no hard cap. DB `max_workers` overrides plan when set. */
export function effectiveMaxWorkers(
  client: ClientPlanRow | null,
  catalog?: PlanCatalogLimits | null
): number | null {
  if (!client) return null
  const fromDb = positiveLimit(client.max_workers)
  if (fromDb != null) return fromDb
  const fromCatalog = positiveLimit(catalog?.workers_max)
  if (fromCatalog != null) return fromCatalog
  const lim = PLAN_LIMITS[normalizeTier(client.plan_tier)].workers
  return lim === Infinity ? null : lim
}

/**
 * Max tickets per calendar month. `null` = no hard cap.
 * DB `max_tickets_per_month` overrides plan when set (useful for custom enterprise deals).
 */
export function effectiveMaxTicketsPerMonth(
  client: ClientPlanRow | null,
  catalog?: PlanCatalogLimits | null
): number | null {
  if (!client) return null
  const fromDb = positiveLimit(client.max_tickets_per_month)
  if (fromDb != null) return fromDb
  const fromCatalog = positiveLimit(catalog?.tickets_per_month_max)
  if (fromCatalog != null) return fromCatalog
  const lim = PLAN_LIMITS[normalizeTier(client.plan_tier)].tickets_per_month
  return lim === Infinity ? null : lim
}
