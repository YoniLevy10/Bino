import { describe, expect, it } from 'vitest'
import { assessBuyerFit, shouldKeepDiscoveredLead } from '@/lib/sales-leads/fit-score'
import {
  CORE_FOCUS_CITIES,
  getSalesCitiesForRun,
  ISRAEL_SALES_CITIES,
} from '@/lib/sales-leads/config'
import { findDuplicate } from '@/lib/sales-leads/dedupe'
import { normalizePhone } from '@/lib/sales-leads/phone'
import { selectJobsForBudget, computeYieldScore } from '@/lib/sales-leads/query-queue'
import {
  DISCOVERY_SEGMENT_MAP,
  placesSearchJobsFor,
} from '@/lib/sales-leads/discovery-mapping'

describe('sales-leads buyer fit', () => {
  it('scores building management companies as suitable', () => {
    const a = assessBuyerFit({
      name: 'חברת ניהול ואחזקת בניינים אלון בע״מ',
      phone: '03-5551234',
      websiteUrl: 'https://alon-mgmt.co.il',
      address: 'תל אביב',
      segmentSlug: 'building_mgmt',
    })
    expect(a.fitClass).toBe('suitable')
    expect(a.score).toBeGreaterThanOrEqual(60)
    expect(a.estimatedMrrIls).toBe(699)
  })

  it('rejects solo trades (Fixly ICP, not BINO buyers)', () => {
    const a = assessBuyerFit({
      name: 'אינסטלטור דוד כהן',
      phone: '050-1234567',
      segmentSlug: 'building_mgmt',
    })
    expect(a.fitClass).toBe('unsuitable')
    expect(shouldKeepDiscoveredLead({ name: 'אינסטלטור דוד כהן', phone: '0501234567' })).toBe(
      false,
    )
  })

  it('keeps property managers for review/suitable', () => {
    expect(
      shouldKeepDiscoveredLead({
        name: 'ניהול נכסים מטרו',
        phone: '052-9876543',
        websiteUrl: 'https://metro-pm.co.il',
        segmentSlug: 'property_mgmt',
      }),
    ).toBe(true)
  })
})

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

describe('sales-leads dedupe + phone', () => {
  it('normalizes IL mobile phones', () => {
    expect(normalizePhone('050-1234567')).toBe('972501234567')
  })

  it('dedupes by phone', () => {
    const hit = findDuplicate(
      { phoneNormalized: '972501234567' },
      [
        {
          id: '1',
          phoneNormalized: '972501234567',
          sourceName: 'google_places',
          externalId: 'x',
          businessName: 'א',
          segmentSlug: 'building_mgmt',
          city: 'תל אביב',
        },
      ],
    )
    expect(hit?.reason).toBe('phone')
  })
})

describe('sales-leads query budget', () => {
  it('computes yield and selects jobs', () => {
    expect(computeYieldScore({ raw: 10, uniqueNew: 4, suitable: 3, needsReview: 2 })).toBeGreaterThan(
      0,
    )
    const jobs = placesSearchJobsFor(DISCOVERY_SEGMENT_MAP[0], 'תל אביב').slice(0, 5)
    const selected = selectJobsForBudget(jobs, [], 3)
    expect(selected.length).toBeLessThanOrEqual(3)
  })
})
