/**
 * BINO sales-lead discovery config.
 * Goal: reach ~₪100k MRR by finding buyers who manage multi-building operations —
 * not only classic חברות אחזקה, and not Fixly-style solo trades.
 */

export const DEFAULT_SALES_CITY = 'תל אביב'

/** Daily city rotation across Israel (UTC day-of-year). */
export const ISRAEL_SALES_CITIES = [
  'תל אביב',
  'ירושלים',
  'חיפה',
  'באר שבע',
  'ראשון לציון',
  'פתח תקווה',
  'נתניה',
  'אשדוד',
  'חולון',
  'בני ברק',
  'רמת גן',
  'אשקלון',
  'רחובות',
  'הרצליה',
  'כפר סבא',
  'מודיעין',
  'חדרה',
  'נהריה',
  'אילת',
  'טבריה',
] as const

/**
 * Buyer segments that can pay for BINO and move north-star revenue.
 * Pricing math (MRR only): ~200×Pro@499 / ~143×Business@699 / mix + add-ons.
 */
export const CORE_SALES_SEGMENT_SLUGS = [
  'building_mgmt',
  'property_mgmt',
  'facility_mgmt',
  'condo_tower',
  'vaad_bayit_mgmt',
  'housing_corp',
  'student_housing',
  'senior_housing',
  'real_estate_dev',
  'office_park',
  'aparthotel',
  'kibbutz_housing',
] as const

export type SalesSegmentSlug = (typeof CORE_SALES_SEGMENT_SLUGS)[number]

/** Hebrew labels for Superadmin filters / cards. */
export const SEGMENT_LABELS_HE: Record<string, string> = {
  building_mgmt: 'ניהול / אחזקת בניינים',
  property_mgmt: 'ניהול נכסים',
  facility_mgmt: 'ניהול מתקנים (FM)',
  condo_tower: 'מגדלי מגורים',
  vaad_bayit_mgmt: 'ניהול ועדי בתים',
  housing_corp: 'חברות דיור',
  student_housing: 'מעונות סטודנטים',
  senior_housing: 'דיור מוגן',
  real_estate_dev: 'יזמות + אחזקה',
  office_park: 'פארקי משרדים / מתחמים',
  aparthotel: 'דירות נופש / אפרטהוטל',
  kibbutz_housing: 'קיבוץ / מושב',
}

export function segmentLabelHe(slug: string | null | undefined): string {
  if (!slug) return 'לא מסווג'
  return SEGMENT_LABELS_HE[slug] ?? slug
}

export const DISCOVERY_TOTAL_BUDGET = 800
export const DISCOVERY_PER_SEGMENT_CAP = 80
export const DISCOVERY_API_CALL_BUDGET = 120
export const DISCOVERY_QUERY_EXPLORE_RATIO = 0.2

/** Fit weights for B2B platform buyers (companies preferred). */
export const BUYER_FIT_WEIGHTS = {
  orgBuyerSignal: 30,
  multiSiteSignal: 22,
  retailOrSoloTradePenalty: -45,
  evidencePhone: 12,
  evidenceWebsite: 10,
  evidenceAddress: 6,
  segmentMatch: 14,
  areaHint: 6,
} as const

/** Rough MRR estimate per segment (ILS) for pipeline prioritization. */
export const SEGMENT_MRR_HINT: Record<string, number> = {
  building_mgmt: 699,
  property_mgmt: 699,
  facility_mgmt: 899,
  condo_tower: 499,
  vaad_bayit_mgmt: 299,
  housing_corp: 899,
  student_housing: 699,
  senior_housing: 699,
  real_estate_dev: 899,
  office_park: 699,
  aparthotel: 499,
  kibbutz_housing: 499,
}

export function getSalesCity(): string {
  return process.env.BINO_SALES_CITY?.trim() || DEFAULT_SALES_CITY
}

/** Rotate city by UTC day unless BINO_SALES_CITY is set. */
export function getSalesCityForToday(now = new Date()): string {
  const forced = process.env.BINO_SALES_CITY?.trim()
  if (forced) return forced
  const start = Date.UTC(now.getUTCFullYear(), 0, 0)
  const day = Math.floor((now.getTime() - start) / 86_400_000)
  return ISRAEL_SALES_CITIES[day % ISRAEL_SALES_CITIES.length]
}

export function getSalesSegmentSlugs(): string[] {
  const raw = process.env.BINO_SALES_SEGMENT_SLUGS?.trim()
  if (!raw) return [...CORE_SALES_SEGMENT_SLUGS]
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function getDiscoveryTotalBudget(): number {
  const n = Number(process.env.BINO_SALES_DISCOVERY_TOTAL_BUDGET)
  if (Number.isFinite(n) && n > 0) return Math.min(Math.floor(n), 3000)
  return DISCOVERY_TOTAL_BUDGET
}

export function getDiscoveryPerSegmentCap(): number {
  const n = Number(process.env.BINO_SALES_DISCOVERY_PER_SEGMENT_CAP)
  if (Number.isFinite(n) && n > 0) return Math.min(Math.floor(n), 200)
  return DISCOVERY_PER_SEGMENT_CAP
}

export function getDiscoveryApiCallBudget(): number {
  const n = Number(process.env.BINO_SALES_DISCOVERY_API_CALL_BUDGET)
  if (Number.isFinite(n) && n > 0) return Math.min(Math.floor(n), 400)
  return DISCOVERY_API_CALL_BUDGET
}
