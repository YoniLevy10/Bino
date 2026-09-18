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
  it('matches the personal founder-voice template without a found-via line', () => {
    const { body } = defaultOutreachMessage(
      lead({
        businessName: 'ניהול בניינים אבי',
        city: 'רמת גן',
        segmentSlug: 'vaad_bayit_mgmt',
      })
    )
    expect(body).toBe(`היי ניהול בניינים אבי, מה נשמע?
אני יוני, פיתחתי את BINO – מערכת לחברות ניהול ואחזקה שמרכזת במקום אחד את כל העבודה מול הבניינים: תקלות ודיווחים מהדיירים, עובדים, מעקב טיפול, דוחות וניהול שוטף.

המטרה היא בעיקר להוריד את כל הבלאגן של וואטסאפ, טלפונים ואקסלים ולתת למנהל תמונה ברורה של מה קורה בכל בניין.

אנחנו כבר עובדים עם חברת ניהול בפועל, ואני כרגע מחפש עוד כמה חברות לבדוק איתן התאמה.

אם רלוונטי לך, אשמח להראות לך ב-10 דקות איך זה עובד ולשמוע איך אתם מנהלים את זה היום.`)
    expect(body).not.toMatch(/הגעתי אליך דרך/)
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
      expect(v.body).not.toMatch(/הגעתי אליך דרך/)
    }
  })

  it('picks a requested variant id', () => {
    const { variant, body } = defaultOutreachMessage(lead({}), 'personal_b')
    expect(variant.id).toBe('personal_b')
    expect(body).toContain('כל תקלה חוזרת למנהל')
  })
})
