import {
  CORE_SALES_SEGMENT_SLUGS,
  getSalesCity,
  getSalesCityForToday,
} from '@/lib/sales-leads/config'

export type DiscoverySegmentMapping = {
  slug: (typeof CORE_SALES_SEGMENT_SLUGS)[number] | string
  placesQueryHe: string
  placesQueriesHeExtra?: string[]
  placesQueryEn: string
  placesQueriesEnExtra?: string[]
  osmFilters: string[]
  outreachAngleHe: string
}

export type DiscoverySearchArea = {
  labelHe: string
  labelEn?: string
  lat: number
  lng: number
  radiusMeters: number
}

export type CityGeoProfile = {
  city: string
  center: { lat: number; lng: number; radiusMeters: number }
  bbox: { south: number; west: number; north: number; east: number }
  areas: DiscoverySearchArea[]
}

const CITY_COORDS: Record<string, { lat: number; lng: number; radius: number }> = {
  'תל אביב': { lat: 32.0853, lng: 34.7818, radius: 14000 },
  ירושלים: { lat: 31.7683, lng: 35.2137, radius: 14000 },
  חיפה: { lat: 32.794, lng: 34.9896, radius: 12000 },
  'באר שבע': { lat: 31.2518, lng: 34.7913, radius: 12000 },
  'ראשון לציון': { lat: 31.973, lng: 34.7925, radius: 10000 },
  'פתח תקווה': { lat: 32.084, lng: 34.8878, radius: 9000 },
  נתניה: { lat: 32.3215, lng: 34.8532, radius: 10000 },
  אשדוד: { lat: 31.8044, lng: 34.6553, radius: 10000 },
  חולון: { lat: 32.0158, lng: 34.7874, radius: 8000 },
  'בני ברק': { lat: 32.0849, lng: 34.8352, radius: 7000 },
  'רמת גן': { lat: 32.0823, lng: 34.8144, radius: 7000 },
  אשקלון: { lat: 31.6688, lng: 34.5743, radius: 9000 },
  רחובות: { lat: 31.8928, lng: 34.8113, radius: 8000 },
  הרצליה: { lat: 32.1624, lng: 34.8447, radius: 8000 },
  'כפר סבא': { lat: 32.1782, lng: 34.9076, radius: 8000 },
  מודיעין: { lat: 31.897, lng: 35.0104, radius: 9000 },
  חדרה: { lat: 32.434, lng: 34.9196, radius: 9000 },
  נהריה: { lat: 33.0059, lng: 35.0941, radius: 8000 },
  אילת: { lat: 29.5577, lng: 34.9519, radius: 10000 },
  טבריה: { lat: 32.7922, lng: 35.5312, radius: 8000 },
}

export function getCityGeoProfile(city?: string | null): CityGeoProfile {
  const c = (city ?? getSalesCity()).trim()
  const known = CITY_COORDS[c]
  const envLat = Number(process.env.BINO_SALES_CITY_LAT)
  const envLng = Number(process.env.BINO_SALES_CITY_LNG)
  const envRadius = Number(process.env.BINO_SALES_CITY_RADIUS_M)
  const lat = known?.lat ?? (Number.isFinite(envLat) ? envLat : 32.0853)
  const lng = known?.lng ?? (Number.isFinite(envLng) ? envLng : 34.7818)
  const radius = known?.radius ?? (Number.isFinite(envRadius) && envRadius > 0 ? envRadius : 12000)
  const delta = radius / 111_000
  return {
    city: c,
    center: { lat, lng, radiusMeters: radius },
    bbox: {
      south: lat - delta,
      west: lng - delta,
      north: lat + delta,
      east: lng + delta,
    },
    areas: [{ labelHe: c, labelEn: c, lat, lng, radiusMeters: radius }],
  }
}

/**
 * Buyer-side discovery queries — organizations that feel maintenance pain
 * across multiple buildings and can buy BINO toward ₪100k MRR.
 */
export const DISCOVERY_SEGMENT_MAP: DiscoverySegmentMapping[] = [
  {
    slug: 'building_mgmt',
    placesQueryHe: 'חברת ניהול בניינים',
    placesQueriesHeExtra: [
      'חברת אחזקת בניינים',
      'ניהול ואחזקת מבנים',
      'חברת ניהול בתים משותפים',
      'שירותי ניהול בניינים',
    ],
    placesQueryEn: 'building management company',
    placesQueriesEnExtra: ['property maintenance company Israel'],
    osmFilters: ['office=property_management'],
    outreachAngleHe:
      'זיכרון תפעולי לבניינים — שיוך אוטומטי, SLA, תקלות חוזרות והוכחת חיסכון',
  },
  {
    slug: 'property_mgmt',
    placesQueryHe: 'ניהול נכסים',
    placesQueriesHeExtra: [
      'חברת ניהול נכסים',
      'ניהול דירות להשקעה',
      'ניהול נדלן מניב',
      'property management',
    ],
    placesQueryEn: 'property management',
    placesQueriesEnExtra: ['residential property manager'],
    osmFilters: ['office=property_management'],
    outreachAngleHe: 'תיק נכסים עם תקלות חוזרות — המלצת עובד/ספק והוכחת עלות לבניין',
  },
  {
    slug: 'facility_mgmt',
    placesQueryHe: 'ניהול מתקנים',
    placesQueriesHeExtra: [
      'facility management',
      'חברת facility',
      'אחזקת מתקנים',
      'ניהול תחזוקה מוסדית',
    ],
    placesQueryEn: 'facility management company',
    placesQueriesEnExtra: ['FM company Israel'],
    osmFilters: ['office=company'],
    outreachAngleHe: 'מניעת כשלים ותחזית מערכות — מעבר מתיעוד עבודה להחלטות',
  },
  {
    slug: 'condo_tower',
    placesQueryHe: 'ניהול מגדל מגורים',
    placesQueriesHeExtra: [
      'ניהול בניין מגורים',
      'חברת ניהול קונדו',
      'ניהול מתחם מגורים',
      'אחזקת מגדלים',
    ],
    placesQueryEn: 'residential tower management',
    placesQueriesEnExtra: ['condo management company'],
    osmFilters: [],
    outreachAngleHe: 'תקשורת דיירים + SLA במגדל — בלי התערבות מנהל בכל תקלה',
  },
  {
    slug: 'vaad_bayit_mgmt',
    placesQueryHe: 'ניהול ועד בית',
    placesQueriesHeExtra: [
      'חברת ניהול ועדי בתים',
      'שירותי ועד בית',
      'ניהול בתים משותפים',
      'גזברות ועד בית',
    ],
    placesQueryEn: 'condo association management',
    placesQueriesEnExtra: ['homeowners association management'],
    osmFilters: [],
    outreachAngleHe: 'ועדים מרובים במערכת אחת — זמן עד שיוך ופתרון כמדד מכירה',
  },
  {
    slug: 'housing_corp',
    placesQueryHe: 'חברת דיור',
    placesQueriesHeExtra: [
      'דיור ציבורי',
      'חברה עירונית לדיור',
      'שיכון ופיתוח',
      'ניהול דיור מוסדי',
    ],
    placesQueryEn: 'public housing corporation',
    placesQueriesEnExtra: ['municipal housing company'],
    osmFilters: ['office=government'],
    outreachAngleHe: 'פורטפוליו גדול — עלות תחזוקה לבניין וזיהוי תקלות חוזרות',
  },
  {
    slug: 'student_housing',
    placesQueryHe: 'מעונות סטודנטים',
    placesQueriesHeExtra: [
      'ניהול מעונות',
      'דיור סטודנטים',
      'אחזקת מעונות',
      'student dormitory management',
    ],
    placesQueryEn: 'student housing management',
    placesQueriesEnExtra: ['student dorms Israel'],
    osmFilters: ['amenity=student_accommodation'],
    outreachAngleHe: 'נפח דיווחים גבוה — אוטומציה בלי מנהל בכל פנייה',
  },
  {
    slug: 'senior_housing',
    placesQueryHe: 'דיור מוגן',
    placesQueriesHeExtra: [
      'בית אבות ניהול',
      'אחזקת דיור מוגן',
      'רשת דיור מוגן',
      'assisted living management',
    ],
    placesQueryEn: 'assisted living management',
    placesQueriesEnExtra: ['senior housing facility'],
    osmFilters: ['amenity=nursing_home'],
    outreachAngleHe: 'אחזקה רציפה ו-SLA — התראות מוקדמות לפני חריגה',
  },
  {
    slug: 'real_estate_dev',
    placesQueryHe: 'יזם נדלן אחזקה',
    placesQueriesHeExtra: [
      'חברת נדלן עם אחזקה',
      'ניהול אחרי מסירה',
      'אחזקת פרויקט מגורים',
      'property developer maintenance',
    ],
    placesQueryEn: 'real estate developer property management',
    placesQueriesEnExtra: ['post handover building management'],
    osmFilters: ['office=estate_agent'],
    outreachAngleHe: 'אחרי מסירה — זיכרון תפעולי שמוכיח חיסכון ליזם/רוכשים',
  },
  {
    slug: 'office_park',
    placesQueryHe: 'ניהול פארק משרדים',
    placesQueriesHeExtra: [
      'ניהול מרכז מסחרי',
      'אחזקת קניון',
      'ניהול מתחם עסקים',
      'business park management',
    ],
    placesQueryEn: 'office park management',
    placesQueriesEnExtra: ['commercial property management'],
    osmFilters: ['office=coworking'],
    outreachAngleHe: 'מתחמים מסחריים — ספקים, עלויות, ומניעת כשלים חוזרים',
  },
  {
    slug: 'aparthotel',
    placesQueryHe: 'דירות נופש ניהול',
    placesQueriesHeExtra: [
      'אפרטהוטל',
      'ניהול דירות Airbnb',
      'חברת ניהול יחידות אירוח',
      'short term rental management',
    ],
    placesQueryEn: 'aparthotel management',
    placesQueriesEnExtra: ['vacation rental property management'],
    osmFilters: ['tourism=apartment'],
    outreachAngleHe: 'יחידות מפוזרות — שיוך מהיר ותיעוד עלות תחזוקה',
  },
  {
    slug: 'kibbutz_housing',
    placesQueryHe: 'קיבוץ אחזקת מבנים',
    placesQueriesHeExtra: [
      'מושב ניהול נכסים',
      'אחזקה קהילתית',
      'מזכירות קיבוץ אחזקה',
      'קיבוץ תחזוקת בתים',
    ],
    placesQueryEn: 'kibbutz housing maintenance',
    placesQueriesEnExtra: ['moshav property management'],
    osmFilters: [],
    outreachAngleHe: 'נכסי קהילה מרובים — תור עבודה חכם בלי עומס על המזכירות',
  },
]

export function placesQueriesFor(mapping: DiscoverySegmentMapping): string[] {
  return [
    mapping.placesQueryHe,
    ...(mapping.placesQueriesHeExtra ?? []),
    mapping.placesQueryEn,
    ...(mapping.placesQueriesEnExtra ?? []),
  ]
    .map((q) => q.trim())
    .filter(Boolean)
}

export type PlacesSearchJob = {
  textQuery: string
  area: DiscoverySearchArea
  queryKey: string
  segmentSlug: string
  languageCode: 'he' | 'en'
  outreachAngleHe: string
}

function detectLang(query: string): 'he' | 'en' {
  if (/[A-Za-z]/.test(query) && !/[\u0590-\u05FF]/.test(query)) return 'en'
  return 'he'
}

export function placesSearchJobsFor(
  mapping: DiscoverySegmentMapping,
  city: string,
  areas?: DiscoverySearchArea[],
): PlacesSearchJob[] {
  const profile = getCityGeoProfile(city)
  const searchAreas = areas ?? profile.areas
  const jobs: PlacesSearchJob[] = []
  for (const area of searchAreas) {
    for (const queryBase of placesQueriesFor(mapping)) {
      const lang = detectLang(queryBase)
      const placeLabel = area.labelHe || city
      jobs.push({
        textQuery: `${queryBase} ${placeLabel}`.trim(),
        area,
        queryKey: `${mapping.slug}|${lang}|${queryBase}|${area.labelHe}`,
        segmentSlug: mapping.slug,
        languageCode: lang,
        outreachAngleHe: mapping.outreachAngleHe,
      })
    }
  }
  return jobs
}

export function getDiscoveryCity(): string {
  return getSalesCityForToday()
}

export function getDiscoveryMappingsForSlugs(slugs: string[]): DiscoverySegmentMapping[] {
  const set = new Set(slugs)
  return DISCOVERY_SEGMENT_MAP.filter((m) => set.has(m.slug))
}

export function outreachAngleForSegment(slug: string | null | undefined): string {
  const hit = DISCOVERY_SEGMENT_MAP.find((m) => m.slug === slug)
  return hit?.outreachAngleHe ?? 'זיכרון תפעולי חכם — החלטות, מניעה, והוכחת חיסכון'
}
