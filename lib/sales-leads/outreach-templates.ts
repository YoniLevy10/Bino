/**
 * Segment-specific WhatsApp opening message variants for manual outreach.
 * Cold first touch only — warm tone; phone/meeting come after interest.
 * A/B tracked via sales_lead_events action=outreach_variant — never auto-sent.
 *
 * Note: `outreachAngle` stays in the superadmin UI for the seller; it is NOT
 * pasted into the WhatsApp body (too jargon-y for a cold open).
 */

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

/** Soft close — invite a reply; do not push call/meeting on first touch. */
const CLOSE =
  '\n\nאם זה מדבר אליכם — פשוט תענו כאן, ואשמח להסביר בקצרה ובלי לחץ.'

export function outreachVariantsForLead(lead: SalesLead): OutreachVariant[] {
  const w = who(lead)
  const city = cityBit(lead)
  const slug = lead.segmentSlug || 'building_mgmt'

  const bySegment: Record<string, OutreachVariant[]> = {
    vaad_bayit_mgmt: [
      {
        id: 'vaad_a',
        labelHe: 'חיבור אישי',
        body: `היי, כאן יוני מ-BINO 🙂\nנתקלתי ב${w}${city} וחשבתי שכדאי להגיד שלום.\nאנחנו עוזרים לחברות שמנהלות כמה ועדים — שהכל יהיה מסודר יותר, בלי לרדוף אחרי כל תקלה ידנית.${CLOSE}`,
      },
      {
        id: 'vaad_b',
        labelHe: 'שקט למנהל',
        body: `שלום, כאן יוני מ-BINO.\nאצל הרבה מנהלי ועדים היום נשבר מזה שכל תקלה חוזרת אליהם.\nל${w} חשבתי שאולי יעניין לשמוע איך אפשר לסגור יותר דברים בלי התערבות בכל פעם.${CLOSE}`,
      },
      {
        id: 'vaad_c',
        labelHe: 'זמן ושקט',
        body: `היי מ-BINO,\nרציתי לפנות אליכם ב${w}${city} בעדינות — אנחנו עוזרים לוועדים לעבוד יותר בשקט: שיוך מהיר יותר, פחות תקלות חוזרות, ופחות רעש על המנהל.${CLOSE}`,
      },
    ],
    facility_mgmt: [
      {
        id: 'fm_a',
        labelHe: 'לפני הכשל',
        body: `היי, כאן יוני מ-BINO 🙂\nראיתי את ${w}${city} וחשבתי שזה יכול להיות רלוונטי לכם.\nאנחנו עוזרים לצוותי FM לראות בעיות לפני שהן הופכות לתקלה גדולה — לא רק לתעד אחרי שהן קרו.${CLOSE}`,
      },
      {
        id: 'fm_b',
        labelHe: 'ספקים בשקט',
        body: `שלום מ-BINO,\nל${w}: הרבה פעמים הידע על ספקים, עלויות ותקלות חוזרות נשאר בראש של מישהו אחד.\nאנחנו עוזרים לשמור את זה במקום אחד, ולהמליץ למי לפנות בלי לנחש.${CLOSE}`,
      },
      {
        id: 'fm_c',
        labelHe: 'בלי הפתעות',
        body: `היי, כאן יוני מ-BINO.\nחריגות SLA מעייפות את כולם. חשבתי על ${w}${city} — אולי יעניין אתכם לראות סיכון מראש, במקום לגלות אחרי הפספוס.${CLOSE}`,
      },
    ],
    housing_corp: [
      {
        id: 'hc_a',
        labelHe: 'עלות לבניין',
        body: `היי, כאן יוני מ-BINO 🙂\nלחברות דיור כמו ${w} חשוב לראות מה עולה כל בניין ואיפה חוזרות אותן תקלות.\nרציתי לבדוק אם זה משהו שמדבר אליכם.${CLOSE}`,
      },
      {
        id: 'hc_b',
        labelHe: 'פורטפוליו רגוע',
        body: `שלום מ-BINO,\n${w}${city} — נשמע כמו תיק גדול. אנחנו עוזרים לשמור זיכרון תפעולי אחיד לכל נכס, בלי אקסלים ובלי לנחש מה כבר ניסו.${CLOSE}`,
      },
      {
        id: 'hc_c',
        labelHe: 'הזמנה עדינה',
        body: `היי, כאן יוני מ-BINO.\nאשמח להכיר את ${w} ולוודא אם בכלל רלוונטי לכם — איך מקצרים זמן עד פתרון ומזהים תקלות שחוזרות על עצמן.${CLOSE}`,
      },
    ],
  }

  const generic: OutreachVariant[] = [
    {
      id: 'gen_a',
      labelHe: 'שלום חם',
      body: `היי, כאן יוני מ-BINO 🙂\nנתקלתי ב${w}${city} וחשבתי שכדאי להגיד שלום.\nאנחנו עוזרים לחברות ניהול ואחזקה לעבוד עם זיכרון חכם לכל בניין — פחות בלאגן, יותר החלטות נכונות.${CLOSE}`,
    },
    {
      id: 'gen_b',
      labelHe: 'לא עוד מערכת',
      body: `שלום, כאן יוני מ-BINO.\n${w} — רציתי להגיד בקצרה: אנחנו לא עוד מערכת תקלות.\nאנחנו בונים זיכרון תפעולי לבניינים, וממליצים אוטומטית מי הכי מתאים לטפל.${CLOSE}`,
    },
    {
      id: 'gen_c',
      labelHe: 'חיסכון בשקט',
      body: `היי מ-BINO 🙂\nלחברות כמו ${w}${city} אנחנו עוזרים לראות חיסכון אמיתי בזמן ובכסף — מי מטפל מהר יותר, מה חוזר, ומה עולה לכל בניין.${CLOSE}`,
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
