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
  [PAID_ADDON_KEYS.calendar]: {
    id: PAID_ADDON_KEYS.calendar,
    title: 'יומן משרד',
    tagline: 'פגישות, ועדות ואירועים במקום אחד',
    description:
      'תכנון יומי למשרד האחזקה: פגישות עם דיירים, ועד בית, קבלנים ומשימות פנימיות — מקושר לפרויקטים.',
    highlights: ['תצוגת חודש ושבוע', 'סוגי אירוע (ועד, אחזקה ועוד)', 'ייצוא ל-Google Calendar'],
    featureHref: '/calendar',
    featureCtaHe: 'ליומן המשרד',
    marketing: {
      headline: 'יומן אחד לכל מה שקורה במשרד — בלי אקסלים וקבוצות וואטסאפ',
      intro:
        'משרדי אחזקה מנהלים עשרות פגישות בחודש: ועדי בית, דיירים, קבלנים, ביקורי שטח. יומן המשרד במקור מרכז את כל האירועים לצד הפרויקטים והתקלות.',
      valueProps: [
        'פחות בלבול — כולם יודעים מתי יש ועד ומי אחראי',
        'סוגי אירוע מוכנים — סינון מהיר',
        'ייצוא ל-Google Calendar — סנכרון לנייד',
        'קישור לפרויקט — הקשר לבניין תמיד ליד האירוע',
      ],
      scenarios: [
        'מנהל משרד שמתאם בין עובדי שטח לפגישות בניין',
        'חברות עם מספר ועדות בית באותו שבוע',
        'צוות שרוצה להפסיק לנהל יומן בנייר',
      ],
      closing: 'תיאום מסודר, פחות טעויות בלוחות זמנים, ומראה מקצועי מול דיירים וועדים.',
    },
  },
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
    tagline: 'נוכחות שטח — מדבקות NFC ו-Offline',
    description:
      'רישום כניסה ויציאה לעובדי שטח במדבקות NFC, משמרות, דוחות שעות וסנכרון גם בלי רשת.',
    highlights: [
      'מדבקות NFC בדלת — בלי אפליקציה',
      'דוחות ואישור משמרות במשרד',
      'סנכרון Offline',
    ],
    featureHref: '/attendance',
    featureCtaHe: 'לחתמת עובדים',
    marketing: {
      headline: 'יודעים מי בשטח, כמה שעות, ומתי — בלי גיליונות',
      intro:
        'עובדי אחזקה בשטח לא תמיד ליד המשרד. חתמת העובדים נותנת כניסה ויציאה בהצמדת טלפון למדבקה NFC, סיכום שעות לפי עובד, וממשק משרד לאישור משמרות — הכל מחובר לתקלות שכבר מנהלתם במערכת.',
      valueProps: [
        'מדבקות NFC — רישום תוך שניות',
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
  [PAID_ADDON_KEYS.pilot_sms]: {
    id: PAID_ADDON_KEYS.pilot_sms,
    title: 'SMS פיילוט לדיירים',
    tagline: 'הודעת פתיחה לכל דיירי הבניין',
    description:
      'בתחילת פיילוט — SMS רב-לשוני (עברית, אנגלית, צרפתית) לדיירים עם טלפון בפרויקט, והמלצה לשמור את מוקד התקלות.',
    highlights: ['הודעה מוכנה מראש', 'ספירת נמענים לפני שליחה', 'לוג שליחה במערכת'],
    featureHref: '/pilot-sms',
    featureCtaHe: 'ל-SMS פיילוט',
    marketing: {
      headline: 'פתיחת פיילוט בבניין? כל הדיירים מקבלים הודעה מקצועית בלחיצה',
      intro:
        'בתחילת עבודה בבניין, הדיירים לא תמיד יודעים איך לפתוח תקלה ולשמור את מספר המוקד. SMS הפיילוט שולח הודעת פתיחה מוכנה — בעברית, אנגלית וצרפתית.',
      valueProps: [
        'הודעה מנוסחת מראש — בלי לכתוב מחדש בכל בניין',
        'רב-לשוני — מתאים לדיירים דוברי EN/FR',
        'ספירת נמענים לפני שליחה',
        'לוג במערכת — תיעוד שההודעה יצאה',
      ],
      scenarios: [
        'התחלת ניהול אחזקה בבניין חדש',
        'מעבר מחברה קודמת — הסבר על המוקד החדש',
        'פיילוט לפני חוזה מלא',
      ],
      closing: 'פחות "לא ידעתי איך לפתוח תקלה", יותר פניות נכונות מההתחלה.',
    },
  },
  [PAID_ADDON_KEYS.project_documents]: {
    id: PAID_ADDON_KEYS.project_documents,
    title: 'תיקיית מסמכים',
    tagline: 'ארכיון קבצים לכל פרויקט',
    description:
      'העלאה ושמירה של חוזים, תוכניות ומסמכים — מסודר לפי בניין, עם הורדה מאובטחת.',
    highlights: ['PDF ו-Office', 'עד 15MB לקובץ', 'מחיקה והורדה מהירה'],
    featureHref: '/project-documents',
    featureCtaHe: 'לתיקיית מסמכים',
    marketing: {
      headline: 'כל מסמכי הבניין במקום אחד — לא בתיקיות במייל',
      intro:
        'חוזים, תוכניות, פרוטוקולי ועד — בדרך כלל מפוזרים בין וואטסאפ ומייל. תיקיית המסמכים נותנת ארכיון לכל פרויקט מתוך מסך הפרויקט.',
      valueProps: [
        'מסודר לפי בניין',
        'PDF, Word, Excel — עד 15MB',
        'הורדה מהירה מהדפדפן',
        'מחיקה והחלפה — גרסה עדכנית זמינה',
      ],
      scenarios: [
        'משרד שמחזיק חוזים ותוכניות לכל בניין',
        'ביקורי שטח שצריכים מסמך מהנייד',
        'החלפת קבלן — כל המסמכים במקום אחד',
      ],
      closing: 'פחות חיפושים, יותר שליטה ומסירות מקצועית ללקוח.',
    },
  },
  [PAID_ADDON_KEYS.whatsapp_inbox]: {
    id: PAID_ADDON_KEYS.whatsapp_inbox,
    title: 'תיבת WhatsApp',
    tagline: 'שיחות דיירים בזמן אמת',
    description: 'צפייה והשבה לדיירים מתוך המערכת — בתוך חלון 24 שעות.',
    highlights: ['רשימת שיחות', 'היסטוריית הודעות', 'קישור מתוך התקלה'],
    featureHref: '/whatsapp-inbox',
    featureCtaHe: 'לתיבת WhatsApp',
    marketing: {
      headline: 'כל שיחות הדיירים במקום אחד — כמו ProSaaS',
      intro: 'מנהל רואה מה הדייר כתב ב-WhatsApp ויכול להשיב מהמערכת.',
      valueProps: ['Inbox מרכזי', 'Realtime', 'קישור לתקלה'],
      scenarios: ['מנהל שרוצה לענות לדייר בלי לפתוח טלפון'],
      closing: 'תקשורת מהירה ומקצועית עם דיירים.',
    },
  },
  [PAID_ADDON_KEYS.campaigns]: {
    id: PAID_ADDON_KEYS.campaigns,
    title: 'קמפיינים SMS',
    tagline: 'תפוצה מותאמת לבניין',
    description: 'שליחת SMS לכל דיירי פרויקט — טקסט חופשי, ללא אימוג׳י.',
    highlights: ['תבנית מותאמת', 'dry-run', 'לוג שליחה'],
    featureHref: '/campaigns',
    featureCtaHe: 'לקמפיינים',
    marketing: {
      headline: 'הודעה לכל הבניין בלחיצה',
      intro: 'מעבר ל-SMS פיילוט — כל הודעה שתבחרו.',
      valueProps: ['019SMS', 'ספירת נמענים', 'ללא אימוג׳י'],
      scenarios: ['הודעה על עבודות', 'תזכורת כללית'],
      closing: 'תקשורת המונית פשוטה ובטוחה.',
    },
  },
  [PAID_ADDON_KEYS.collections]: {
    id: PAID_ADDON_KEYS.collections,
    title: 'גביית ועד',
    tagline: 'חיוב דיירים דרך חשבונית ירוקה',
    description:
      'יצירת חיובים, קישורי תשלום ומסמכים דרך Morning — מחובר לחשבון Morning שלכם.',
    highlights: ['מפתח API per-tenant', 'קישור תשלום', 'מסמכים אוטומטיים'],
    featureHref: '/collections',
    featureCtaHe: 'לגביית ועד',
    marketing: {
      headline: 'גביית ועד בלי אקסלים — ישירות מחשבונית ירוקה',
      intro:
        'הלקוחה שלכם כבר עובדת ב-Morning. Bamakor מחבר את הדיירים, יוצר חיובים ושולח קישורי תשלום ב-SMS או WhatsApp.',
      valueProps: [
        'חשבון Morning משלכם — לא חשבון פלטפורמה',
        'סליקה דרך Cardcom / Isracard / Grow',
        'מסמכים וקבלות אוטומטיים ב-Morning',
        'הגדרות מרוכזות תחת «חשבונית ירוקה»',
      ],
      scenarios: [
        'חברת ניהול שגובה דמי ועד חודשיים',
        'משרד שרוצה לשלוח קישור תשלום לדייר אחרי אישור',
        'ועד שעובד כבר עם חשבונית ירוקה',
      ],
      closing: 'פחות מעקב ידני, יותר גבייה בזמן.',
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
