/**
 * Segment-specific WhatsApp opening message variants for manual outreach.
 * A/B tracked via sales_lead_events action=outreach_variant — never auto-sent.
 */

import { outreachAngleForSegment } from '@/lib/sales-leads/discovery-mapping'
import type { SalesLead } from '@/lib/sales-leads/types'

export type OutreachVariant = {
  id: string
  labelHe: string
  body: string
}

function who(lead: SalesLead): string {
  return lead.businessName || lead.name
}

function cityBit(lead: SalesLead): string {
  return lead.city ? ` ב${lead.city}` : ''
}

export function outreachVariantsForLead(lead: SalesLead): OutreachVariant[] {
  const w = who(lead)
  const city = cityBit(lead)
  const angle = lead.outreachAngle || outreachAngleForSegment(lead.segmentSlug)
  const slug = lead.segmentSlug || 'building_mgmt'

  const close =
    '\n\nאפשר לקבוע שיחת הדגמה קצרה של 15 דקות? (או לשלוח לינק לדף של BINO)'

  const bySegment: Record<string, OutreachVariant[]> = {
    vaad_bayit_mgmt: [
      {
        id: 'vaad_a',
        labelHe: 'ועדים מרובים',
        body: `שלום, כאן מ-BINO.\nראיתי את ${w}${city} — חברות שמנהלות כמה ועדים חוסכות המון זמן כשיש זיכרון תפעולי אחד לכל בניין.\n${angle}${close}`,
      },
      {
        id: 'vaad_b',
        labelHe: 'בלי מנהל בכל תקלה',
        body: `שלום מ-BINO,\nל${w}: המדד שלנו הוא אחוז התקלות שנסגרות בלי התערבות מנהל — עם שיוך אוטומטי ו-SLA.\n${angle}${close}`,
      },
      {
        id: 'vaad_c',
        labelHe: 'חיסכון מוכח',
        body: `היי, BINO כאן.\nאצל ועדי בית הזמן עד שיוך ופתרון הוא הכאב האמיתי. ${w}${city} נשמע בדיוק לזה.\n${angle}${close}`,
      },
    ],
    facility_mgmt: [
      {
        id: 'fm_a',
        labelHe: 'מניעת כשלים',
        body: `שלום, כאן BINO.\nל${w}${city}: אנחנו עוזרים ל-FM לעבור מתיעוד עבודה להתראות מוקדמות על מערכות שעלולות להיכשל.\n${angle}${close}`,
      },
      {
        id: 'fm_b',
        labelHe: 'ספקים ועלויות',
        body: `שלום מ-BINO,\n${w} — זיכרון של ספקים, עלויות ותקלות חוזרות לכל מתקן, עם המלצה אוטומטית למי לשייך.\n${angle}${close}`,
      },
      {
        id: 'fm_c',
        labelHe: 'SLA',
        body: `היי, BINO.\nחריגות SLA עולות ביוקר. ${w}${city} יכולים לראות סיכון מראש במקום אחרי הפספוס.\n${angle}${close}`,
      },
    ],
    housing_corp: [
      {
        id: 'hc_a',
        labelHe: 'עלות לבניין',
        body: `שלום מ-BINO,\nלחברות דיור כמו ${w} המדד הקריטי הוא עלות תחזוקה לבניין + שיעור תקלות חוזרות.\n${angle}${close}`,
      },
      {
        id: 'hc_b',
        labelHe: 'פורטפוליו',
        body: `שלום, BINO כאן.\n${w}${city}: זיכרון תפעולי אחיד לכל נכס בפורטפוליו — בלי אקסל ובלי ניחושים.\n${angle}${close}`,
      },
      {
        id: 'hc_c',
        labelHe: 'דמו 15 דק׳',
        body: `היי, כאן BINO.\nנשמח להראות ל${w} איך מזהים תקלות חוזרות ומקצרים זמן עד פתרון בתיק גדול.\n${angle}${close}`,
      },
    ],
  }

  const generic: OutreachVariant[] = [
    {
      id: 'gen_a',
      labelHe: 'זווית מקצועית',
      body: `שלום, כאן מ-BINO.\nראיתי את ${w}${city} וחשבתי שזה יכול לעניין אתכם:\n${angle}${close}`,
    },
    {
      id: 'gen_b',
      labelHe: 'לא עוד מערכת תקלות',
      body: `שלום מ-BINO,\n${w} — אנחנו לא עוד מערכת תקלות. אנחנו בונים זיכרון תפעולי חכם לבניינים וממליצים אוטומטית מי מטפל.\n${angle}${close}`,
    },
    {
      id: 'gen_c',
      labelHe: 'הוכחת חיסכון',
      body: `היי, BINO כאן.\nלחברות ניהול כמו ${w}${city} אנחנו מוכיחים חיסכון בזמן ובכסף — זמן עד שיוך, זמן עד פתרון, תקלות חוזרות.\n${angle}${close}`,
    },
  ]

  return bySegment[slug] ?? generic
}

export function defaultOutreachMessage(lead: SalesLead, variantId?: string | null): {
  variant: OutreachVariant
  body: string
} {
  const variants = outreachVariantsForLead(lead)
  const variant = variants.find((v) => v.id === variantId) ?? variants[0]
  return { variant, body: variant.body }
}
