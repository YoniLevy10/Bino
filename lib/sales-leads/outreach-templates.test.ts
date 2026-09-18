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
  it('matches the personal founder-voice template', () => {
    const { body } = defaultOutreachMessage(
      lead({
        businessName: 'ניהול בניינים אבי',
        city: 'רמת גן',
        segmentSlug: 'vaad_bayit_mgmt',
      })
    )
    expect(body).toContain('היי ניהול בניינים אבי, מה נשמע?')
    expect(body).toContain('אני יוני, הגעתי אליך דרך חברות ניהול ועדי בתים ברמת גן.')
    expect(body).toContain('פיתחתי את BINO')
    expect(body).toContain('בלאגן של וואטסאפ, טלפונים ואקסלים')
    expect(body).toContain('עובדים עם חברת ניהול בפועל')
    expect(body).toContain('ב-10 דקות')
    expect(body).toContain('איך אתם מנהלים את זה היום')
  })

  it('keeps three personal A/B variants', () => {
    const variants = outreachVariantsForLead(lead({}))
    expect(variants.map((v) => v.id)).toEqual([
      'personal_a',
      'personal_b',
      'personal_c',
    ])
    for (const v of variants) {
      expect(v.body).toMatch(/אני יוני/)
      expect(v.body).toMatch(/10 דקות/)
    }
  })

  it('picks a requested variant id', () => {
    const { variant, body } = defaultOutreachMessage(lead({}), 'personal_b')
    expect(variant.id).toBe('personal_b')
    expect(body).toContain('כל תקלה חוזרת למנהל')
  })
})
