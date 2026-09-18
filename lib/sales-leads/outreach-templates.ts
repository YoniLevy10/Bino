/**
 * Personal WhatsApp opening messages for manual sales outreach.
 * Cold first touch in Yoni's voice — never auto-sent.
 * A/B tracked via sales_lead_events action=outreach_variant.
 */

import type { SalesLead } from '@/lib/sales-leads/types'

export type OutreachVariant = {
  id: string
  labelHe: string
  body: string
}

function company(lead: SalesLead): string {
  return (lead.businessName || lead.name || '').trim() || 'החברה'
}

/** Short greeting name — company, trimmed of legal suffixes when possible. */
function greetingName(lead: SalesLead): string {
  const raw = company(lead)
  return raw
    .replace(/\s+(בע["״']?מ\.?|ltd\.?|llc\.?)$/i, '')
    .replace(/\s+/g, ' ')
    .trim() || 'היי'
}

const CORE_BODY = `אני יוני, פיתחתי את BINO – מערכת לחברות ניהול ואחזקה שמרכזת במקום אחד את כל העבודה מול הבניינים: תקלות ודיווחים מהדיירים, עובדים, מעקב טיפול, דוחות וניהול שוטף.

המטרה היא בעיקר להוריד את כל הבלאגן של וואטסאפ, טלפונים ואקסלים ולתת למנהל תמונה ברורה של מה קורה בכל בניין.

אנחנו כבר עובדים עם חברת ניהול בפועל, ואני כרגע מחפש עוד כמה חברות לבדוק איתן התאמה.

אם רלוונטי לך, אשמח להראות לך ב-10 דקות איך זה עובד ולשמוע איך אתם מנהלים את זה היום.`

const CLOSE =
  'אם רלוונטי לך, אשמח להראות לך ב-10 דקות איך זה עובד ולשמוע איך אתם מנהלים את זה היום.'

export function outreachVariantsForLead(lead: SalesLead): OutreachVariant[] {
  const name = greetingName(lead)
  const w = company(lead)
  const hello = `היי ${name}, מה נשמע?`

  return [
    {
      id: 'personal_a',
      labelHe: 'אישי · בלאגן יומיומי',
      body: `${hello}\n${CORE_BODY}`,
    },
    {
      id: 'personal_b',
      labelHe: 'אישי · מי מטפל',
      body: `${hello}
אני יוני, פיתחתי את BINO – מערכת לחברות ניהול ואחזקה שמרכזת במקום אחד את כל העבודה מול הבניינים: תקלות מהדיירים, שיוך לעובדים/ספקים, מעקב טיפול ודוחות.

הכאב היומיומי שאני שומע שוב ושוב אצל חברות כמו ${w}: כל תקלה חוזרת למנהל, וואטסאפים בלי סוף, ואף אחד לא זוכר מה כבר ניסו בכל בניין.

אנחנו כבר עובדים עם חברת ניהול בפועל, ואני מחפש עוד כמה חברות לבדוק איתן התאמה.

${CLOSE}`,
    },
    {
      id: 'personal_c',
      labelHe: 'אישי · תקלות חוזרות',
      body: `${hello}
אני יוני, פיתחתי את BINO כדי שחברות ניהול ואחזקה יוכלו לראות מה קורה בכל בניין במקום אחד — בלי לרדוף אחרי וואטסאפ, טלפונים ואקסלים.

במיוחד כשאותן תקלות חוזרות, או כשאין זיכרון מי תיקן ומה עלה.

אנחנו כבר עובדים עם חברת ניהול בפועל, ואני כרגע מחפש עוד כמה חברות לבדוק איתן התאמה.

${CLOSE}`,
    },
  ]
}

export function defaultOutreachMessage(lead: SalesLead, variantId?: string | null): {
  variant: OutreachVariant
  body: string
} {
  const variants = outreachVariantsForLead(lead)
  const variant = variants.find((v) => v.id === variantId) ?? variants[0]
  return { variant, body: variant.body }
}
