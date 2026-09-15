import { describe, expect, it } from 'vitest'
import {
  findDuplicate,
  normalizeBusinessKey,
  type ExistingLeadLite,
} from '@/lib/sales-leads/dedupe'

const baseExisting = (overrides: Partial<ExistingLeadLite> & { id: string }): ExistingLeadLite => ({
  phoneNormalized: null,
  sourceName: 'google_places',
  externalId: null,
  businessName: null,
  segmentSlug: 'building_mgmt',
  city: 'תל אביב',
  websiteHost: null,
  ...overrides,
})

describe('normalizeBusinessKey', () => {
  it('lowercases, strips quotes, and collapses whitespace', () => {
    expect(normalizeBusinessKey('  חברת "אלון"  ניהול  ')).toBe('חברת אלון ניהול')
    expect(normalizeBusinessKey(null)).toBe('')
  })
})

describe('findDuplicate', () => {
  it('matches by phone', () => {
    const hit = findDuplicate(
      { phoneNormalized: '972501234567' },
      [
        baseExisting({
          id: 'phone-1',
          phoneNormalized: '972501234567',
          externalId: 'x',
          businessName: 'א',
        }),
      ],
    )
    expect(hit).toEqual({ reason: 'phone', existingId: 'phone-1' })
  })

  it('matches by website domain', () => {
    const hit = findDuplicate(
      { websiteHost: 'alon-mgmt.co.il' },
      [
        baseExisting({
          id: 'domain-1',
          websiteHost: 'alon-mgmt.co.il',
          businessName: 'אלון',
        }),
      ],
    )
    expect(hit).toEqual({ reason: 'website_domain', existingId: 'domain-1' })
  })

  it('matches by source + externalId', () => {
    const hit = findDuplicate(
      { sourceName: 'google_places', externalId: 'ChIJ_abc123' },
      [
        baseExisting({
          id: 'src-1',
          sourceName: 'google_places',
          externalId: 'ChIJ_abc123',
          businessName: 'אחר',
        }),
      ],
    )
    expect(hit).toEqual({ reason: 'source_external', existingId: 'src-1' })
  })

  it('matches by business name + segment + city', () => {
    const hit = findDuplicate(
      {
        businessName: 'חברת "מטרו" ניהול',
        segmentSlug: 'property_mgmt',
        city: 'תל אביב',
      },
      [
        baseExisting({
          id: 'biz-1',
          businessName: 'חברת מטרו ניהול',
          segmentSlug: 'property_mgmt',
          city: 'תל אביב',
        }),
      ],
    )
    expect(hit).toEqual({ reason: 'business_segment_city', existingId: 'biz-1' })
  })

  it('prefers phone over other reasons when several could match', () => {
    const hit = findDuplicate(
      {
        phoneNormalized: '972501234567',
        websiteHost: 'same.co.il',
        sourceName: 'google_places',
        externalId: 'ext-9',
        businessName: 'זהה',
        segmentSlug: 'building_mgmt',
        city: 'תל אביב',
      },
      [
        baseExisting({
          id: 'phone-wins',
          phoneNormalized: '972501234567',
          websiteHost: 'same.co.il',
          sourceName: 'google_places',
          externalId: 'ext-9',
          businessName: 'זהה',
        }),
      ],
    )
    expect(hit?.reason).toBe('phone')
  })

  it('returns null when nothing overlaps', () => {
    const hit = findDuplicate(
      {
        phoneNormalized: '972509999999',
        websiteHost: 'other.co.il',
        sourceName: 'osm',
        externalId: 'n-1',
        businessName: 'שונה לגמרי',
        segmentSlug: 'facility_mgmt',
        city: 'חיפה',
      },
      [
        baseExisting({
          id: 'existing',
          phoneNormalized: '972501111111',
          websiteHost: 'alon.co.il',
          sourceName: 'google_places',
          externalId: 'ChIJ_x',
          businessName: 'אלון',
          city: 'תל אביב',
        }),
      ],
    )
    expect(hit).toBeNull()
  })
})
