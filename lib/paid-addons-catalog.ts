import { isNavFeatureEnabled, PREMIUM_NAV_FEATURE_IDS } from '@/lib/client-nav-features'
import type { SidebarNavItemId } from '@/lib/sidebar-nav'

export type PaidAddonId = (typeof PREMIUM_NAV_FEATURE_IDS)[number]

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
}

/** Paid add-ons shown on /addons — names and copy are intentional (sales). */
export const PAID_ADDON_CATALOG: readonly PaidAddonCatalogEntry[] = [
  {
    id: 'calendar',
    title: 'יומן משרד',
    tagline: 'פגישות, ועדות ואירועים במקום אחד',
    description:
      'תכנון יומי למשרד האחזקה: פגישות עם דיירים, ועד בית, קבלנים ומשימות פנימיות — מקושר לפרויקטים.',
    highlights: ['תצוגת חודש ושבוע', 'סוגי אירוע (ועד, אחזקה ועוד)', 'ייצוא ל-Google Calendar'],
    marketing: {
      headline: 'יומן אחד לכל מה שקורה במשרד — בלי אקסלים וקבוצות וואטסאפ',
      intro:
        'משרדי אחזקה מנהלים עשרות פגישות בחודש: ועדי בית, דיירים כועסים, קבלנים, ביקורי שטח. כשהכל מפוזר — משהו נופל. יומן המשרד במקור מרכז את כל האירועים לצד הפרויקטים והתקלות, כדי שכל הצוות רואה את אותו לוח זמנים.',
      valueProps: [
        'פחות בלבול — כולם יודעים מתי יש ועד ומי אחראי',
        'סוגי אירוע מוכנים (ועד, אחזקה, פגישת דייר) — סינון מהיר',
        'ייצוא ל-Google Calendar — סנכרון לנייד של המנהל',
        'קישור לפרויקט — הקשר לבניין תמיד ליד האירוע',
      ],
      scenarios: [
        'מנהל משרד שמתאם בין עובדי שטח לפגישות בניין',
        'חברות עם מספר ועדות בית באותו שבוע',
        'צוות שרוצה להפסיק לנהל יומן בנייר או בקבוצה',
      ],
      closing:
        'תוסף זה חוסך זמן תיאום, מפחית טעויות בלוחות זמנים, ונותן למשרד מראה מקצועי מול דיירים וועדים.',
    },
  },
  {
    id: 'attendance',
    title: 'שעון עובדים',
    tagline: 'נוכחות משרד עם QR בכניסה',
    description:
      'רישום כניסה ויציאה לעובדי משרד, סיכום שעות, התראות גדר גיאוגרפית וניהול משמרות פתוחות.',
    highlights: ['QR להדפסה בכניסה', 'שעות ועלות לפי עובד', 'דוחות לפי תקופה'],
    marketing: {
      headline: 'שעות עבודה מדויקות — בלי ויכוחים ובלי גיליונות ידניים',
      intro:
        'כשאין רישום נוכחות אמין, קשה לדעת מי במשרד, כמה שעות עבד כל עובד, ומה העלות האמיתית ללקוח. שעון העובדים נותן כניסה ויציאה בלחיצה (QR בכניסה), עם סיכום שעות ודוחות — הכל בתוך המערכת שכבר מנהלת את התקלות.',
      valueProps: [
        'QR להדפסה בכניסה — עובד סורק ונרשם תוך שניות',
        'סיכום שעות לפי עובד ותקופה — מוכן לשכר או לחיוב',
        'התראות גדר גיאוגרפית — וידוא שהרישום מהמשרד',
        'משמרות פתוחות — תזכורת לסגור יום עבודה',
      ],
      scenarios: [
        'משרד אחזקה עם 3–15 עובדי משרד שצריך לעקוב אחר נוכחות',
        'מנהל שמחייב לקוחות לפי שעות עבודה בפועל',
        'ארגון שרוצה להפסיק Excel של שעות בסוף החודש',
      ],
      closing:
        'שקיפות מלאה בנוכחות = אמון מהלקוחות, פחות ויכוחים, וחיסכון בשעות ניהול בסוף כל חודש.',
    },
  },
  {
    id: 'pilot_sms',
    title: 'SMS פיילוט לדיירים',
    tagline: 'הודעת פתיחה לכל דיירי הבניין',
    description:
      'בתחילת פיילוט בבניין — שליחת SMS רב-לשוני (עברית, אנגלית, צרפתית) לכל דייר עם טלפון בפרויקט, עם המלצה לשמור את מוקד התקלות.',
    highlights: ['הודעה מוכנה מראש', 'ספירת נמענים לפני שליחה', 'לוג שליחה במערכת'],
    marketing: {
      headline: 'פתיחת פיילוט בבניין? כל הדיירים מקבלים הודעה מקצועית בלחיצה',
      intro:
        'בתחילת עבודה בבניין חדש, הדיירים לא תמיד יודעים איך לפתוח תקלה, למי לפנות, ואיך לשמור את המספר. SMS הפיילוט שולח הודעת פתיחה מוכנה — בעברית, אנגלית וצרפתית — לכל דייר עם טלפון בפרויקט, עם הנחיה ברורה לשמור את מוקד התקלות.',
      valueProps: [
        'הודעה מנוסחת מראש — אין צורך לכתוב מחדש בכל בניין',
        'רב-לשוני — מתאים לדיירים דוברי EN/FR',
        'ספירת נמענים לפני שליחה — יודעים בדיוק למי נשלח',
        'לוג במערכת — תיעוד שההודעה יצאה בפיילוט',
      ],
      scenarios: [
        'התחלת ניהול אחזקה בבניין חדש — "הכרזה" ראשונה לדיירים',
        'מעבר מחברה קודמת — הסבר על המוקד החדש',
        'פיילוט לפני חוזה מלא — מיתוג מקצועי מהיום הראשון',
      ],
      closing:
        'פחות שיחות "לא ידעתי איך לפתוח תקלה", יותר פניות נכונות מההתחלה, ורושם מקצועי שמייצר אמון בדיירים.',
    },
  },
  {
    id: 'project_documents',
    title: 'תיקיית מסמכים',
    tagline: 'ארכיון קבצים לכל פרויקט',
    description:
      'העלאה ושמירה של חוזים, תוכניות, מסמכים וקבצים — מסודר לפי בניין, עם הורדה מאובטחת.',
    highlights: ['PDF ו-Office', 'עד 15MB לקובץ', 'מחיקה והורדה מהירה'],
    marketing: {
      headline: 'כל מסמכי הבניין במקום אחד — לא בתיקיות במייל',
      intro:
        'חוזים, תוכניות, פרוטוקולי ועד, אישורים — בדרך כלל מפוזרים בין וואטסאפ, מייל ותיקיות במחשב. תיקיית המסמכים נותנת ארכיון מאובטח לכל פרויקט: מעלים, מורידים ומוחקים מתוך מסך הפרויקט, בלי לחפש בקבצים אישיים.',
      valueProps: [
        'מסודר לפי בניין — כל מסמך ליד הפרויקט הנכון',
        'PDF, Word, Excel ועוד — עד 15MB לקובץ',
        'הורדה מהירה מהדפדפן — גם בשטח מהנייד',
        'מחיקה והחלפה — גרסה עדכנית תמיד זמינה',
      ],
      scenarios: [
        'טכנאי בשטח שצריך תוכנית או חוזה מיד',
        'מנהל פרויקט שמעביר מסמכים לעובד חדש',
        'חברה שרוצה להפסיק "שלח לי שוב את הקובץ"',
      ],
      closing:
        'מסמכים מרוכזים = פחות זמן בירור, פחות טעויות, ומסירות מקצועית מול ועד בית וקבלנים.',
    },
  },
] as const

export function getPaidAddonCatalogEntry(id: PaidAddonId): PaidAddonCatalogEntry | undefined {
  return PAID_ADDON_CATALOG.find((e) => e.id === id)
}

export type PaidAddonDisplayEntry = PaidAddonCatalogEntry & {
  locked: boolean
}

/** All paid add-ons for /addons — always lists the full catalog with lock state. */
export function getPaidAddonsForDisplay(
  enabledFeatures: SidebarNavItemId[] | null | undefined
): PaidAddonDisplayEntry[] {
  const legacyUnlimited = !enabledFeatures?.length
  return PAID_ADDON_CATALOG.map((entry) => ({
    ...entry,
    locked: legacyUnlimited ? false : !isNavFeatureEnabled(enabledFeatures, entry.id),
  }))
}

export function getLockedPaidAddons(
  enabledFeatures: SidebarNavItemId[] | null | undefined
): PaidAddonCatalogEntry[] {
  return getPaidAddonsForDisplay(enabledFeatures)
    .filter((entry) => entry.locked)
    .map(({ locked: _locked, ...entry }) => entry)
}

export function getLockedPaidAddonsCount(
  enabledFeatures: SidebarNavItemId[] | null | undefined
): number {
  return getLockedPaidAddons(enabledFeatures).length
}
