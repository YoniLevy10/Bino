/**
 * Segment-specific WhatsApp opening message variants for manual outreach.
 * Cold first touch: warm + pain-led + invite to open a chat.
 * Phone / meeting only after interest — never auto-sent.
 * A/B tracked via sales_lead_events action=outreach_variant.
 *
 * `outreachAngle` stays in the superadmin UI for the seller; not pasted raw.
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

/** Invite to open a conversation — not a demo/call ask yet. */
const CLOSE =
  '\n\nאם זה מוכר גם אצלכם — תענו «כן» או «מעניין», ואפתח שיחה קצרה ממש כאן.'

export function outreachVariantsForLead(lead: SalesLead): OutreachVariant[] {
  const w = who(lead)
  const city = cityBit(lead)
  const slug = lead.segmentSlug || 'building_mgmt'

  const bySegment: Record<string, OutreachVariant[]> = {
    vaad_bayit_mgmt: [
      {
        id: 'vaad_a',
        labelHe: 'כל תקלה עליי',
        body: `היי, כאן יוני מ-BINO 🙂\nל${w}${city}: כמה מהיום שלכם עדיין הולך על «מי מטפל בזה?» — כשכל תקלה חוזרת אליכם, גם כשיש עובד או ספק?\n\nBINO בונה זיכרון תפעולי לכל בניין: ממליץ אוטומטית למי לשייך, מזהה תקלות חוזרות, ומראה כמה זמן המנהל חוסך.${CLOSE}`,
      },
      {
        id: 'vaad_b',
        labelHe: 'תקלות חוזרות',
        body: `שלום, כאן יוני מ-BINO.\nשאלה שמנהלי ועדים מכירים טוב מדי: אותו בניין, אותה תקלה — שוב.\n\nאנחנו עוזרים ל${w} לקצר זמן עד שיוך וזמן עד פתרון, ולהוריד את שיעור התקלות שחוזרות על עצמן — בלי שמנהל ייכנס לכל שיחה.${CLOSE}`,
      },
      {
        id: 'vaad_c',
        labelHe: 'כמה ועדים = עומס',
        body: `היי מ-BINO 🙂\nכשמנהלים כמה ועדים${city}, הכאב היומיומי הוא אותו דבר: וואטסאפים, טלפונים, ותקלות שחוזרות — בלי מקום אחד שזוכר מה כבר ניסו בכל בניין.\n\nBINO מחזיק את הזיכרון הזה בשביל ${w} — וממליץ מי לשייך הכי נכון, מהר.${CLOSE}`,
      },
    ],
    facility_mgmt: [
      {
        id: 'fm_a',
        labelHe: 'כיבוי שריפות',
        body: `היי, כאן יוני מ-BINO 🙂\nל${w}${city}: כמה מהשבוע הולך על כיבוי שריפות — במקום לתפוס מערכת לפני שהיא נופלת?\n\nBINO לומד מהיסטוריית התקלות והציוד, מתריע מוקדם על סיכון SLA, וממליץ מי לספק/עובד לשלוח.${CLOSE}`,
      },
      {
        id: 'fm_b',
        labelHe: 'ספקים בראש',
        body: `שלום מ-BINO.\nהכאב הקלאסי ב-FM: הידע על ספקים, מחירים ותקלות חוזרות יושב בראש של אדם אחד — וכשהוא עמוס, הכל נתקע.\n\nל${w} אנחנו בונים זיכרון אחד למתקן: מי תיקן, כמה עלה, ומה כדאי לנסות בפעם הבאה.${CLOSE}`,
      },
      {
        id: 'fm_c',
        labelHe: 'SLA בלחץ',
        body: `היי, כאן יוני מ-BINO.\nחריגת SLA כואבת פעמיים — ללקוח ולצוות.\n${w}${city}: במקום לגלות אחרי הפספוס, BINO מתריע מראש ומקצר זמן עד שיוך ופתרון.${CLOSE}`,
      },
    ],
    housing_corp: [
      {
        id: 'hc_a',
        labelHe: 'עלות לבניין',
        body: `היי, כאן יוני מ-BINO 🙂\nלחברות דיור כמו ${w} הכאב היומיומי ברור: לא יודעים באמת מה עולה כל בניין, ואיפה אותן תקלות חוזרות שוב ושוב.\n\nBINO מראה עלות תחזוקה לבניין + שיעור תקלות חוזרות — וממליץ מי מטפל הכי נכון.${CLOSE}`,
      },
      {
        id: 'hc_b',
        labelHe: 'תיק גדול בלי זיכרון',
        body: `שלום מ-BINO.\n${w}${city} — תיק גדול בלי זיכרון תפעולי אחיד זה אקסלים, ניחושים, ואותן טעויות שוב.\n\nאנחנו בונים זיכרון לכל נכס: מה נכשל, מי תיקן, כמה זמן לקח — כדי לקצר פתרון ולהוכיח חיסכון.${CLOSE}`,
      },
      {
        id: 'hc_c',
        labelHe: 'זמן עד פתרון',
        body: `היי, כאן יוני מ-BINO.\nכשהפורטפוליו גדול, כל יום בלי שיוך מהיר עולה כסף ומוניטין.\nל${w}: BINO מקצר זמן עד שיוך וזמן עד פתרון, ומזהה מראש איפה הכשלים חוזרים.${CLOSE}`,
      },
    ],
  }

  const generic: OutreachVariant[] = [
    {
      id: 'gen_a',
      labelHe: 'מי מטפל בזה',
      body: `היי, כאן יוני מ-BINO 🙂\nל${w}${city}: כמה מהיום הולך על «מי מטפל בזה?» — כשכל תקלה חוזרת למנהל, גם כשיש עובד או ספק?\n\nBINO בונה זיכרון תפעולי חכם לכל בניין: ממליץ אוטומטית למי לשייך, מזהה תקלות חוזרות, ומוכיח כמה זמן וכסף נחסכו.${CLOSE}`,
    },
    {
      id: 'gen_b',
      labelHe: 'לא עוד מערכת תקלות',
      body: `שלום, כאן יוני מ-BINO.\n${w} — אנחנו לא עוד מערכת שרק מתעדת תקלות.\nאנחנו לומדים מההיסטוריה של הבניין ומקבלים החלטות בשבילכם: מי מטפל, מתי יש סיכון SLA, ואיפה חוזר אותו כשל.${CLOSE}`,
    },
    {
      id: 'gen_c',
      labelHe: 'כאב יומיומי',
      body: `היי מ-BINO 🙂\nהכאב היומיומי בחברות ניהול כמו ${w}${city}: זמן עד שיוך ארוך, תקלות שחוזרות, ומנהל שנכנס לכל שיחה.\n\nBINO הופך את זה לזיכרון חכם + המלצות אוטומטיות — כדי שיותר תקלות ייסגרו בלי התערבות מנהל.${CLOSE}`,
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
