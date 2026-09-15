import { describe, expect, it, afterEach } from 'vitest'
import {
  CORE_FOCUS_CITIES,
  getGooglePlacesApiKey,
  getSalesCitiesForRun,
  isGooglePlacesConfigured,
  ISRAEL_SALES_CITIES,
  shouldIncludeOsmWithPlaces,
} from '@/lib/sales-leads/config'
import {
  formatPhoneLocalIl,
  normalizePhone,
  whatsappLink,
} from '@/lib/sales-leads/phone'
import {
  DISCOVERY_SEGMENT_MAP,
  placesSearchJobsFor,
} from '@/lib/sales-leads/discovery-mapping'

describe('sales-leads discovery mapping', () => {
  it('covers broad segments beyond classic maintenance cos', () => {
    const slugs = DISCOVERY_SEGMENT_MAP.map((m) => m.slug)
    expect(slugs).toContain('facility_mgmt')
    expect(slugs).toContain('student_housing')
    expect(slugs).toContain('kibbutz_housing')
    expect(slugs.length).toBeGreaterThanOrEqual(10)
  })

  it('builds places jobs with city label', () => {
    const mapping = DISCOVERY_SEGMENT_MAP[0]
    const jobs = placesSearchJobsFor(mapping, 'חיפה')
    expect(jobs.length).toBeGreaterThan(0)
    expect(jobs[0].textQuery).toContain('חיפה')
    expect(jobs[0].outreachAngleHe.length).toBeGreaterThan(10)
  })
})

describe('sales-leads city rotation', () => {
  it('keeps Tel Aviv + Jerusalem anchors and rotates center cities by day', () => {
    const a = getSalesCitiesForRun(new Date('2026-01-01T12:00:00Z'))
    const b = getSalesCitiesForRun(new Date('2026-01-02T12:00:00Z'))
    for (const city of CORE_FOCUS_CITIES) {
      expect(a).toContain(city)
      expect(b).toContain(city)
    }
    for (const city of a) expect(ISRAEL_SALES_CITIES).toContain(city)
    const rotateA = a.filter((c) => !(CORE_FOCUS_CITIES as readonly string[]).includes(c))
    const rotateB = b.filter((c) => !(CORE_FOCUS_CITIES as readonly string[]).includes(c))
    expect(rotateA.length).toBeGreaterThan(0)
    expect(rotateA).not.toEqual(rotateB)
  })
})

describe('sales-leads phone', () => {
  it('normalizes IL mobile phones', () => {
    expect(normalizePhone('050-1234567')).toBe('972501234567')
  })

  it('builds api.whatsapp.com deep link with phone + text', () => {
    const href = whatsappLink('050-1234567', 'שלום')
    expect(href).toMatch(/^https:\/\/api\.whatsapp\.com\/send\?/)
    expect(href).toContain('phone=972501234567')
    expect(href).toContain('text=')
  })

  it('formats local IL number for clipboard', () => {
    expect(formatPhoneLocalIl('972547211542')).toBe('0547211542')
    expect(formatPhoneLocalIl('054-721-1542')).toBe('0547211542')
  })
})

describe('sales-leads places env', () => {
  const keys = [
    'GOOGLE_PLACES_API_KEY',
    'GOOGLE_MAPS_API_KEY',
    'BINO_SALES_DISCOVERY_INCLUDE_OSM',
  ] as const
  const prev: Record<string, string | undefined> = {}

  afterEach(() => {
    for (const k of keys) {
      if (!(k in prev)) continue
      if (prev[k] === undefined) delete process.env[k]
      else process.env[k] = prev[k]
      delete prev[k]
    }
  })

  function stash(k: (typeof keys)[number]) {
    if (!(k in prev)) prev[k] = process.env[k]
  }

  it('reads GOOGLE_PLACES_API_KEY first', () => {
    stash('GOOGLE_PLACES_API_KEY')
    stash('GOOGLE_MAPS_API_KEY')
    process.env.GOOGLE_PLACES_API_KEY = 'places-key'
    process.env.GOOGLE_MAPS_API_KEY = 'maps-key'
    expect(getGooglePlacesApiKey()).toBe('places-key')
    expect(isGooglePlacesConfigured()).toBe(true)
  })

  it('falls back to GOOGLE_MAPS_API_KEY', () => {
    stash('GOOGLE_PLACES_API_KEY')
    stash('GOOGLE_MAPS_API_KEY')
    delete process.env.GOOGLE_PLACES_API_KEY
    process.env.GOOGLE_MAPS_API_KEY = 'maps-only'
    expect(getGooglePlacesApiKey()).toBe('maps-only')
    expect(isGooglePlacesConfigured()).toBe(true)
  })

  it('reports missing key', () => {
    stash('GOOGLE_PLACES_API_KEY')
    stash('GOOGLE_MAPS_API_KEY')
    delete process.env.GOOGLE_PLACES_API_KEY
    delete process.env.GOOGLE_MAPS_API_KEY
    expect(getGooglePlacesApiKey()).toBeNull()
    expect(isGooglePlacesConfigured()).toBe(false)
  })

  it('defaults OSM off when Places is primary', () => {
    stash('BINO_SALES_DISCOVERY_INCLUDE_OSM')
    delete process.env.BINO_SALES_DISCOVERY_INCLUDE_OSM
    expect(shouldIncludeOsmWithPlaces()).toBe(false)
    process.env.BINO_SALES_DISCOVERY_INCLUDE_OSM = '1'
    expect(shouldIncludeOsmWithPlaces()).toBe(true)
  })
})
