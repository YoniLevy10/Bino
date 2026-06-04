import { PAID_ADDON_KEYS, type PaidAddonKey } from '@/lib/paid-addons'
import type { AddonEntitlement } from '@/lib/paid-addons'

export type PaidAddonId = PaidAddonKey

export type PaidAddonMarketing = {
  headline: string
  intro: string
  valueProps: string[]
  scenarios: string[]
  closing: string
}

export type PaidAddonCatalogEntry = {
  id: PaidAddonId
  title: string
  tagline: string
  description: string
  highlights: string[]
  marketing: PaidAddonMarketing
  featureHref: string
  featureCtaHe: string
}

const CATALOG: Record<PaidAddonId, PaidAddonCatalogEntry> = {
  [PAID_ADDON_KEYS.professionals]: {
    id: PAID_ADDON_KEYS.professionals,
    title: 'אנשי מקצוע',
    tagline: 'קבלנים חיצוניים והעברת תקלות ב-SMS',
    description:
      'פנקס אנשי מקצוע לפי תחום (חשמל, אינסטלציה, מעליות ועוד) והעברת תקלה ב-SMS עם פרטי הבניין, הדייר והתיאור.',
    highlights: [
      'פנקס לפי מקצוע וטלפון',
      'העברת תקלה בלחיצה מתוך התקלה',
      'סטטוס ליווי איש מקצוע',
    ],
    featureHref: '/professionals',
    featureCtaHe: 'לפנקס אנשי מקצוע',
    marketing: {
      headline: 'תקלה לקבלן החיצוני הנכון — בלי לחפש מספרים בוואטסאפ',
      intro:
        'כשצריך חשמלאי, מעליתן או אינסטלטור — המשרד לא תמיד זוכר מי אחראי על איזה בניין. פנקס אנשי המקצוע מרכז את כל הקבלנים, ומתוך התקלה שולחים SMS מסודר עם פרטי הבניין, הדייר והתיאור — בלי להעתיק ידנית.',
      valueProps: [
        'פנקס לפי מקצוע — מוצאים את האיש הנכון תוך שניות',
        'SMS אוטומטי עם פרטי תקלה — הקבלן מקבל הכל במקום אחד',
        'מעקב בתקלה — סטטוס ליווי איש מקצוע',
        'נפרד מעובדי שטח — לא מבלבל עם פורטל העובד',
      ],
      scenarios: [
        'משרד אחזקה שעובד עם עשרות קבלנים חיצוניים',
        'מנהל שמעביר תקלות לחשמלאי/מעליתן כמה פעמים ביום',
        'חברה שרוצה תיעוד מי קיבל כל תקלה',
      ],
      closing:
        'פחות שיחות "שלח לי שוב את הפרטים", תגובה מהירה יותר של קבלנים, ומראה מקצועי מול דיירים.',
    },
  },
  [PAID_ADDON_KEYS.worker_stamp]: {
    id: PAID_ADDON_KEYS.worker_stamp,
    title: 'חתמת עובדים',
    tagline: 'נוכחות שטח — QR, NFC ו-Offline',
    description:
      'רישום כניסה ויציאה לעובדי שטח, משמרות, דוחות נוכחות וסנכרון גם בלי רשת. תגי QR מונפקים על ידי במקור.',
    highlights: [
      'סריקת QR/NFC בנייד העובד',
      'דוחות ואישור משמרות במשרד',
      'סנכרון Offline',
    ],
    featureHref: '/attendance',
    featureCtaHe: 'לחתמת עובדים',
    marketing: {
      headline: 'יודעים מי בשטח, כמה שעות, ומתי — בלי גיליונות',
      intro:
        'עובדי אחזקה בשטח לא תמיד ליד המשרד. חתמת העובדים נותנת כניסה ויציאה בסריקה, סיכום שעות לפי עובד, וממשק משרד לאישור משמרות — הכל מחובר לתקלות שכבר מנהלתם במערכת.',
      valueProps: [
        'QR ו-NFC — רישום תוך שניות',
        'פורטל עובד נפרד — לא מערבב עם מנהל המשרד',
        'דוחות נוכחות לפי תקופה',
        'עובד Offline — מסנכרן כשחוזר קליטה',
      ],
      scenarios: [
        'צוות שטח של 5–30 עובדים בבניינים שונים',
        'מנהל שצריך לדעת מי במשמרת עכשיו',
        'חברה שמחייבת לפי שעות בפועל',
      ],
      closing:
        'שקיפות בנוכחות = פחות ויכוחים, חיוב מדויק, ושליטה במשמרות מהמשרד.',
    },
  },
}

export function getPaidAddonCatalogEntry(id: PaidAddonId): PaidAddonCatalogEntry | undefined {
  return CATALOG[id]
}

export type PaidAddonDisplayEntry = PaidAddonCatalogEntry & {
  locked: boolean
  price_ils_monthly: number
}

/** Merge DB entitlements with static marketing for /addons cards. */
export function buildPaidAddonsForDisplay(entitlements: AddonEntitlement[]): PaidAddonDisplayEntry[] {
  return entitlements
    .map((row) => {
      const base = CATALOG[row.addon_key as PaidAddonId]
      if (!base) return null
      return {
        ...base,
        title: row.name_he || base.title,
        description: row.description_he || base.description,
        locked: !row.enabled,
        price_ils_monthly: row.price_ils_monthly,
      }
    })
    .filter((e): e is PaidAddonDisplayEntry => e != null)
}

export function getLockedPaidAddonsCount(entries: PaidAddonDisplayEntry[]): number {
  return entries.filter((e) => e.locked).length
}
