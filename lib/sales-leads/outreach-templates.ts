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

/** How we "found" them — city / company, not raw source jargon. */
function foundVia(lead: SalesLead): string {
  const city = (lead.city || lead.searchCity || '').trim()
  const co = company(lead)
  const slug = lead.segmentSlug || ''

  if (slug === 'vaad_bayit_mgmt') {
    return city ? `חברות ניהול ועדי בתים ב${city}` : 'חברות ניהול ועדי בתים'
  }
  if (slug === 'facility_mgmt') {
    return city ? `חברות FM / אחזקה ב${city}` : 'חברות FM ואחזקה'
  }
  if (slug === 'housing_corp') {
    return city ? `חברות דיור ב${city}` : 'חברות דיור'
  }
  if (city) return `חברות ניהול ואחזקה ב${city}`
  return co
}

const CORE_PITCH = `פיתחתי את BINO – מערכת לחברות ניהול ואחזקה שמרכזת במקום אחד את כל העבודה מול הבניינים: תקלות ודיווחים מהדיירים, עובדים, מעקב טיפול, דוחות וניהול שוטף.

המטרה היא בעיקר להוריד את כל הבלאגן של וואטסאפ, טלפונים ואקסלים ולתת למנהל תמונה ברורה של מה קורה בכל בניין.

אנחנו כבר עובדים עם חברת ניהול בפועל, ואני כרגע מחפש עוד כמה חברות לבדוק איתן התאמה.`

const CLOSE =
  'אם רלוונטי לך, אשמח להראות לך ב-10 דקות איך זה עובד ולשמוע איך אתם מנהלים את זה היום.'

function personalOpen(lead: SalesLead): string {
  const name = greetingName(lead)
  const via = foundVia(lead)
  return `היי ${name}, מה נשמע?\nאני יוני, הגעתי אליך דרך ${via}.`
}

export function outreachVariantsForLead(lead: SalesLead): OutreachVariant[] {
  const open = personalOpen(lead)
  const w = company(lead)

  return [
    {
      id: 'personal_a',
      labelHe: 'אישי · בלאגן יומיומי',
      body: `${open}\n\n${CORE_PITCH}\n\n${CLOSE}`,
    },
    {
      id: 'personal_b',
      labelHe: 'אישי · מי מטפל',
      body: `${open}\n\nפיתחתי את BINO – מערכת לחברות ניהול ואחזקה שמרכזת במקום אחד את כל העבודה מול הבניינים: תקלות מהדיירים, שיוך לעובדים/ספקים, מעקב טיפול ודוחות.\n\nהכאב היומיומי שאני שומע שוב ושוב אצל חברות כמו ${w}: כל תקלה חוזרת למנהל, וואטסאפים בלי סוף, ואף אחד לא זוכר מה כבר ניסו בכל בניין.\n\nאנחנו כבר עובדים עם חברת ניהול בפועל, ואני מחפש עוד כמה חברות לבדוק איתן התאמה.\n\n${CLOSE}`,
    },
    {
      id: 'personal_c',
      labelHe: 'אישי · תקלות חוזרות',
      body: `${open}\n\nפיתחתי את BINO כדי שחברות ניהול ואחזקה יוכלו לראות מה קורה בכל בניין במקום אחד — בלי לרדוף אחרי וואטסאפ, טלפונים ואקסלים.\n\nבמיוחד כשאותן תקלות חוזרות, או כשאין זיכרון מי תיקן ומה עלה.\n\nאנחנו כבר עובדים עם חברת ניהול בפועל, ואני כרגע מחפש עוד כמה חברות לבדוק איתן התאמה.\n\n${CLOSE}`,
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
