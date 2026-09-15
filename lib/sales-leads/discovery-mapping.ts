import {
  CORE_SALES_SEGMENT_SLUGS,
  getSalesCity,
  getSalesCitiesForRun,
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
  'תל אביב': { lat: 32.0853, lng: 34.7818, radius: 16000 },
  ירושלים: { lat: 31.7683, lng: 35.2137, radius: 16000 },
  'רמת גן': { lat: 32.0823, lng: 34.8144, radius: 8000 },
  גבעתיים: { lat: 32.0723, lng: 34.8089, radius: 6000 },
  'בני ברק': { lat: 32.0849, lng: 34.8352, radius: 7000 },
  חולון: { lat: 32.0158, lng: 34.7874, radius: 8000 },
  'בת ים': { lat: 32.0167, lng: 34.75, radius: 7000 },
  'ראשון לציון': { lat: 31.973, lng: 34.7925, radius: 11000 },
  'פתח תקווה': { lat: 32.084, lng: 34.8878, radius: 10000 },
  הרצליה: { lat: 32.1624, lng: 34.8447, radius: 9000 },
  רעננה: { lat: 32.1848, lng: 34.8706, radius: 8000 },
  'כפר סבא': { lat: 32.1782, lng: 34.9076, radius: 8000 },
  'הוד השרון': { lat: 32.15, lng: 34.888, radius: 7000 },
  'רמת השרון': { lat: 32.1461, lng: 34.8392, radius: 7000 },
  מודיעין: { lat: 31.897, lng: 35.0104, radius: 10000 },
  רחובות: { lat: 31.8928, lng: 34.8113, radius: 9000 },
  'נס ציונה': { lat: 31.9293, lng: 34.7986, radius: 7000 },
}

/** Extra Places biases so Tel Aviv / Jerusalem runs cover the metro / center belt. */
const CITY_EXTRA_AREAS: Record<string, DiscoverySearchArea[]> = {
  'תל אביב': [
    { labelHe: 'תל אביב מרכז', lat: 32.0853, lng: 34.7818, radiusMeters: 9000 },
    { labelHe: 'רמת גן', lat: 32.0823, lng: 34.8144, radiusMeters: 7000 },
    { labelHe: 'בני ברק', lat: 32.0849, lng: 34.8352, radiusMeters: 6000 },
    { labelHe: 'חולון בת ים', lat: 32.016, lng: 34.77, radiusMeters: 8000 },
    { labelHe: 'הרצליה רמת השרון', lat: 32.155, lng: 34.842, radiusMeters: 8000 },
  ],
  ירושלים: [
    { labelHe: 'ירושלים מרכז', lat: 31.7683, lng: 35.2137, radiusMeters: 9000 },
    { labelHe: 'ירושלים מערב', lat: 31.78, lng: 35.18, radiusMeters: 8000 },
    { labelHe: 'מבשרת / הר חוצבים', lat: 31.8, lng: 35.15, radiusMeters: 7000 },
  ],
  'ראשון לציון': [
    { labelHe: 'ראשון לציון', lat: 31.973, lng: 34.7925, radiusMeters: 9000 },
    { labelHe: 'נס ציונה רחובות', lat: 31.91, lng: 34.805, radiusMeters: 9000 },
  ],
  'פתח תקווה': [
    { labelHe: 'פתח תקווה', lat: 32.084, lng: 34.8878, radiusMeters: 9000 },
    { labelHe: 'הוד השרון כפר סבא', lat: 32.165, lng: 34.9, radiusMeters: 9000 },
  ],
}

const PROPERTY_OSM = ['office=property_management', 'office=estate_agent'] as const

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
      'חברת ניהול ואחזקה',
    ],
    placesQueryEn: 'building management company',
    placesQueriesEnExtra: ['property maintenance company Israel', 'building maintenance company Tel Aviv'],
    osmFilters: [...PROPERTY_OSM],
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
      'ניהול נכסים תל אביב',
      'ניהול נכסים ירושלים',
    ],
    placesQueryEn: 'property management',
    placesQueriesEnExtra: ['residential property manager', 'property management company Israel'],
    osmFilters: [...PROPERTY_OSM],
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
      'חברת אחזקה מוסדית',
    ],
    placesQueryEn: 'facility management company',
    placesQueriesEnExtra: ['FM company Israel'],
    osmFilters: [...PROPERTY_OSM],
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
      'ניהול מגדלים תל אביב',
    ],
    placesQueryEn: 'residential tower management',
    placesQueriesEnExtra: ['condo management company'],
    osmFilters: [...PROPERTY_OSM],
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
      'ניהול ועדי בתים תל אביב',
      'ניהול ועדי בתים ירושלים',
    ],
    placesQueryEn: 'condo association management',
    placesQueriesEnExtra: ['homeowners association management'],
    osmFilters: [...PROPERTY_OSM],
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
    osmFilters: ['office=government', ...PROPERTY_OSM],
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
      'מעונות סטודנטים תל אביב',
      'מעונות סטודנטים ירושלים',
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
      'דיור מוגן תל אביב',
      'דיור מוגן ירושלים',
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
    osmFilters: [...PROPERTY_OSM],
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
      'ניהול מתחם משרדים הרצליה',
    ],
    placesQueryEn: 'office park management',
    placesQueriesEnExtra: ['commercial property management'],
    osmFilters: ['office=coworking', ...PROPERTY_OSM],
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
      'ניהול דירות נופש תל אביב',
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
  const extras = CITY_EXTRA_AREAS[c]
  const areas: DiscoverySearchArea[] = extras?.length
    ? extras
    : [{ labelHe: c, labelEn: c, lat, lng, radiusMeters: radius }]
  return {
    city: c,
    center: { lat, lng, radiusMeters: radius },
    bbox: {
      south: lat - delta,
      west: lng - delta,
      north: lat + delta,
      east: lng + delta,
    },
    areas,
  }
}

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

export function getDiscoveryCities(): string[] {
  return getSalesCitiesForRun()
}

export function getDiscoveryMappingsForSlugs(slugs: string[]): DiscoverySegmentMapping[] {
  const set = new Set(slugs)
  return DISCOVERY_SEGMENT_MAP.filter((m) => set.has(m.slug))
}

export function outreachAngleForSegment(slug: string | null | undefined): string {
  const hit = DISCOVERY_SEGMENT_MAP.find((m) => m.slug === slug)
  return hit?.outreachAngleHe ?? 'זיכרון תפעולי חכם — החלטות, מניעה, והוכחת חיסכון'
}
