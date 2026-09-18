import { describe, expect, it } from 'vitest'
import {
  defaultOutreachMessage,
  outreachVariantsForLead,
} from '@/lib/sales-leads/outreach-templates'
import type { SalesLead } from '@/lib/sales-leads/types'

function lead(partial: Partial<SalesLead>): SalesLead {
  return {
    id: '1',
    name: 'חברת ניהול לדוגמה',
    businessName: 'חברת ניהול לדוגמה',
    phone: null,
    whatsappPhone: null,
    phoneNormalized: null,
    email: null,
    city: 'תל אביב',
    searchCity: null,
    businessAddress: null,
    segmentSlug: 'building_mgmt',
    sourceName: 'test',
    sourceUrl: null,
    websiteUrl: null,
    externalId: null,
    status: 'discovered',
    fitScore: null,
    fitClass: null,
    fitConfidence: null,
    fitReasons: [],
    contactability: null,
    estimatedBuildings: null,
    estimatedMrrIls: null,
    outreachAngle: null,
    notes: null,
    enrichment: {},
    sourceRefs: [],
    lastSeenAt: null,
    contactedAt: null,
    nextContactAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...partial,
  }
}

describe('outreachVariantsForLead', () => {
  it('opens warm and does not push a demo call on first touch', () => {
    const variants = outreachVariantsForLead(
      lead({ segmentSlug: 'vaad_bayit_mgmt' })
    )
    expect(variants.length).toBeGreaterThan(0)
    for (const v of variants) {
      expect(v.body).toMatch(/BINO/)
      expect(v.body).toMatch(/תענו כאן/)
      expect(v.body).not.toMatch(/15 דק/)
      expect(v.body).not.toMatch(/שיחת הדגמה/)
      expect(v.body).not.toMatch(/מדד מכירה/)
    }
  })

  it('picks a requested variant id', () => {
    const { variant, body } = defaultOutreachMessage(
      lead({ name: 'FM', businessName: 'FM', segmentSlug: 'facility_mgmt' }),
      'fm_b'
    )
    expect(variant.id).toBe('fm_b')
    expect(body).toContain('ספקים')
  })
})
