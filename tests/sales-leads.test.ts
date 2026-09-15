import { describe, expect, it } from 'vitest'
import {
  CORE_FOCUS_CITIES,
  getSalesCitiesForRun,
  ISRAEL_SALES_CITIES,
} from '@/lib/sales-leads/config'
import { normalizePhone } from '@/lib/sales-leads/phone'
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
})
