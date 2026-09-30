/**
 * Midrag (מידרג) external professional search for BINO.
 * Opens in a new tab — not an iframe (X-Frame / product stance).
 *
 * Midrag Results deep links need **serviceId + cityId** (not areaId alone).
 * cityId comes from Midrag `/Search/ListCities` (`{ label, value, areaName }`).
 *
 * Ported from OpticalCenter `src/modules/vendors/external-search.ts`,
 * with trade keys suited to building-maintenance (not retail store tickets).
 */

export type ExternalSearchInput = {
  category: string
  city?: string | null
}

export type MidragCityMatch = {
  /** Midrag cityId (ListCities `value`) */
  cityId: number
  /** Canonical Midrag label (may differ from free-text spelling) */
  midragLabel: string
}

export type MidragServiceMatch = {
  /** Midrag Results `serviceId` (verified via ListFreeSearch → Results) */
  serviceId: number
  /** Midrag service / sector label shown on Results */
  midragLabel: string
  /** Midrag ListSectors value when known */
  sectorId?: number
}

/** BINO building-maintenance trades shown in the Midrag search UI. */
export const MIDRAG_TRADE_CATEGORIES = [
  'electrical',
  'plumbing',
  'hvac',
  'cleaning',
  'security',
  'other',
] as const

export type MidragTradeCategory = (typeof MIDRAG_TRADE_CATEGORIES)[number]

export const MIDRAG_TRADE_LABELS_HE: Record<MidragTradeCategory, string> = {
  electrical: 'חשמל',
  plumbing: 'אינסטלציה',
  hvac: 'מיזוג / מזגנים',
  cleaning: 'ניקיון',
  security: 'מצלמות / אבטחה',
  other: 'אחר',
}

/**
 * BINO trade → Midrag serviceId.
 * Prefer the **general** free-search hit for that trade (not a narrow
 * sub-service), verified live on Midrag (same IDs as OpticalCenter).
 * `other` stays unmapped → InSector picker.
 */
export const MIDRAG_SERVICE_BY_CATEGORY: Record<string, MidragServiceMatch> = {
  // ListFreeSearch "טכנאי מזגנים" → serviceId 284 (not 286 מרכזי)
  hvac: { serviceId: 284, midragLabel: 'תיקון מזגן', sectorId: 18 },
  // ListFreeSearch "חשמלאי" → serviceId 152
  electrical: { serviceId: 152, midragLabel: 'חשמלאים', sectorId: 5 },
  // ListFreeSearch "אינסטלטור" → serviceId 119 (not 135 ניאגרות)
  plumbing: { serviceId: 119, midragLabel: 'אינסטלציה', sectorId: 4 },
  // ListFreeSearch "התקנת מצלמות אבטחה" → 509
  security: {
    serviceId: 509,
    midragLabel: 'התקנת מצלמות אבטחה',
    sectorId: 146,
  },
  // "ניקיון משרדים" — closest Midrag hit for building cleaning
  cleaning: { serviceId: 1249, midragLabel: 'ניקיון משרדים', sectorId: 25 },
}

/**
 * Free-text city → Midrag cityId (from live ListCities).
 * Aliases folded into keys so common spellings resolve without a second lookup.
 */
export const MIDRAG_CITY_ID_BY_CITY: Record<string, MidragCityMatch> = {
  'תל אביב': { cityId: 1243, midragLabel: 'תל אביב' },
  תלאביב: { cityId: 1243, midragLabel: 'תל אביב' },
  'תל-אביב': { cityId: 1243, midragLabel: 'תל אביב' },
  'תל אביב יפו': { cityId: 1243, midragLabel: 'תל אביב' },
  חיפה: { cityId: 421, midragLabel: 'חיפה' },
  ירושלים: { cityId: 515, midragLabel: 'ירושלים' },
  נתניה: { cityId: 900, midragLabel: 'נתניה' },
  'כפר סבא': { cityId: 605, midragLabel: 'כפר סבא' },
  'פתח תקווה': { cityId: 1032, midragLabel: 'פתח תקווה' },
  רעננה: { cityId: 1149, midragLabel: 'רעננה' },
  מודיעין: { cityId: 683, midragLabel: 'מודיעין' },
  רמלה: { cityId: 1132, midragLabel: 'רמלה' },
  'נס ציונה': { cityId: 883, midragLabel: 'נס ציונה' },
  'קרית עקרון': { cityId: 1094, midragLabel: 'קרית עקרון' },
  'קריית עקרון': { cityId: 1094, midragLabel: 'קרית עקרון' },
  'ראשון לציון': { cityId: 1105, midragLabel: 'ראשון לציון' },
  רחובות: { cityId: 1120, midragLabel: 'רחובות' },
  'בת ים': { cityId: 237, midragLabel: 'בת ים' },
  חולון: { cityId: 406, midragLabel: 'חולון' },
  'פרדס חנה': { cityId: 1027, midragLabel: 'פרדס חנה-כרכור' },
  'פרדס חנה-כרכור': { cityId: 1027, midragLabel: 'פרדס חנה-כרכור' },
  'קרית אתא': { cityId: 1083, midragLabel: 'קרית אתא' },
  'קריית אתא': { cityId: 1083, midragLabel: 'קרית אתא' },
  'בית שמש': { cityId: 194, midragLabel: 'בית שמש' },
  כרמיאל: { cityId: 632, midragLabel: 'כרמיאל' },
  עכו: { cityId: 979, midragLabel: 'עכו' },
  רגבה: { cityId: 1110, midragLabel: 'רגבה' },
  טבריה: { cityId: 450, midragLabel: 'טבריה' },
  'קרית שמונה': { cityId: 1096, midragLabel: 'קרית שמונה' },
  'קריית שמונה': { cityId: 1096, midragLabel: 'קרית שמונה' },
  יקנעם: { cityId: 510, midragLabel: 'יקנעם עילית' },
  'יקנעם עילית': { cityId: 510, midragLabel: 'יקנעם עילית' },
  'מגדל העמק': { cityId: 671, midragLabel: 'מגדל העמק' },
  'נוף הגליל': { cityId: 894, midragLabel: 'נוף הגליל' },
  עפולה: { cityId: 995, midragLabel: 'עפולה' },
  אשדוד: { cityId: 121, midragLabel: 'אשדוד' },
  אשקלון: { cityId: 128, midragLabel: 'אשקלון' },
  'באר שבע': { cityId: 136, midragLabel: 'באר שבע' },
  דימונה: { cityId: 347, midragLabel: 'דימונה' },
  'בני ברק': { cityId: 205, midragLabel: 'בני ברק' },
  הרצליה: { cityId: 378, midragLabel: 'הרצליה' },
  'רמת גן': { cityId: 1134, midragLabel: 'רמת גן' },
  'רמת השרון': { cityId: 1138, midragLabel: 'רמת השרון' },
  אריאל: { cityId: 117, midragLabel: 'אריאל' },
  נתיבות: { cityId: 899, midragLabel: 'נתיבות' },
  חדרה: { cityId: 403, midragLabel: 'חדרה' },
}

const MIDRAG_RESULTS = 'https://www.midrag.co.il/Search/Results'
const MIDRAG_IN_SECTOR = 'https://www.midrag.co.il/Search/InSector'
const MIDRAG_IN_CITY = 'https://www.midrag.co.il/Search/InCity'

function normalizeCity(city: string | null | undefined): string {
  return (city ?? '').trim().replace(/\s+/g, ' ')
}

function compactCity(city: string): string {
  return city.replace(/[-\s]/g, '')
}

/** Resolve free-text city to Midrag cityId + canonical label. */
export function midragCityMatchForCity(
  city: string | null | undefined
): MidragCityMatch | null {
  const c = normalizeCity(city)
  if (!c) return null
  const direct = MIDRAG_CITY_ID_BY_CITY[c]
  if (direct) return direct
  const compact = compactCity(c)
  for (const [name, match] of Object.entries(MIDRAG_CITY_ID_BY_CITY)) {
    if (compactCity(name) === compact) return match
  }
  return null
}

/** Resolve BINO trade category to Midrag serviceId + label. */
export function midragServiceMatchForCategory(
  category: string
): MidragServiceMatch | null {
  const key = category.trim().toLowerCase()
  return MIDRAG_SERVICE_BY_CATEGORY[key] ?? null
}

export function midragServiceIdForCategory(category: string): number | null {
  return midragServiceMatchForCategory(category)?.serviceId ?? null
}

export function tradeLabelHe(category: string): string {
  const match = midragServiceMatchForCategory(category)
  if (match) return match.midragLabel
  const key = category.trim().toLowerCase() as MidragTradeCategory
  return MIDRAG_TRADE_LABELS_HE[key] ?? category
}

/**
 * Primary Midrag deep link.
 * Prefer Results with serviceId + cityId; never invent Tel Aviv.
 */
export function buildMidragSearchUrl(input: ExternalSearchInput): string {
  const service = midragServiceMatchForCategory(input.category)
  const cityMatch = midragCityMatchForCity(input.city)

  if (service) {
    if (cityMatch) {
      return `${MIDRAG_RESULTS}?serviceId=${service.serviceId}&cityId=${cityMatch.cityId}`
    }
    return `${MIDRAG_RESULTS}?serviceId=${service.serviceId}`
  }

  return MIDRAG_IN_SECTOR
}

/** When city is set but unmapped, offer Midrag city picker for the service. */
export function buildMidragCityPickerUrl(input: ExternalSearchInput): string | null {
  const service = midragServiceMatchForCategory(input.category)
  if (!service) return null
  if (midragCityMatchForCity(input.city)) return null
  if (!normalizeCity(input.city)) return null
  return `${MIDRAG_IN_CITY}?serviceId=${service.serviceId}`
}

/** Google query biased to Midrag — backup when Midrag Results are too broad. */
export function buildMidragGoogleBackupUrl(input: ExternalSearchInput): string {
  const trade = tradeLabelHe(input.category)
  const match = midragCityMatchForCity(input.city)
  const city = match?.midragLabel || normalizeCity(input.city)
  const q = ['מידרג', trade, city].filter(Boolean).join(' ')
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`
}

export function externalSearchCaption(input: ExternalSearchInput): string {
  const service = midragServiceMatchForCategory(input.category)
  const trade = service?.midragLabel ?? tradeLabelHe(input.category)
  const match = midragCityMatchForCity(input.city)
  const city = normalizeCity(input.city)
  if (!service) {
    return city ? `מידרג · בחירת מקצוע · ${city}` : 'מידרג · בחירת מקצוע'
  }
  if (match) {
    const label =
      city && city !== match.midragLabel
        ? `${city} → ${match.midragLabel}`
        : match.midragLabel
    return `מידרג · ${trade} · ${label}`
  }
  if (city) return `מידרג · ${trade} · ${city} (בחירת עיר במידרג)`
  return `מידרג · ${trade} · ללא עיר`
}

export function normalizeMidragTradeCategory(
  raw: string | null | undefined
): MidragTradeCategory {
  const key = (raw ?? 'other').trim().toLowerCase()
  return (MIDRAG_TRADE_CATEGORIES as readonly string[]).includes(key)
    ? (key as MidragTradeCategory)
    : 'other'
}
