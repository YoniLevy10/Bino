import { isNavFeatureEnabled, PREMIUM_NAV_FEATURE_IDS } from '@/lib/client-nav-features'
import type { SidebarNavItemId } from '@/lib/sidebar-nav'

export type PaidAddonId = (typeof PREMIUM_NAV_FEATURE_IDS)[number]

export type PaidAddonCatalogEntry = {
  id: PaidAddonId
  title: string
  tagline: string
  description: string
  highlights: string[]
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
  },
  {
    id: 'attendance',
    title: 'שעון עובדים',
    tagline: 'נוכחות משרד עם QR בכניסה',
    description:
      'רישום כניסה ויציאה לעובדי משרד, סיכום שעות, התראות גדר גיאוגרפית וניהול משמרות פתוחות.',
    highlights: ['QR להדפסה בכניסה', 'שעות ועלות לפי עובד', 'דוחות לפי תקופה'],
  },
  {
    id: 'pilot_sms',
    title: 'SMS פיילוט לדיירים',
    tagline: 'הודעת פתיחה לכל דיירי הבניין',
    description:
      'בתחילת פיילוט בבניין — שליחת SMS רב-לשוני (עברית, אנגלית, צרפתית) לכל דייר עם טלפון בפרויקט, עם המלצה לשמור את מוקד התקלות.',
    highlights: ['הודעה מוכנה מראש', 'ספירת נמענים לפני שליחה', 'לוג שליחה במערכת'],
  },
  {
    id: 'project_documents',
    title: 'תיקיית מסמכים',
    tagline: 'ארכיון קבצים לכל פרויקט',
    description:
      'העלאה ושמירה של חוזים, תוכניות, מסמכים וקבצים — מסודר לפי בניין, עם הורדה מאובטחת.',
    highlights: ['PDF ו-Office', 'עד 15MB לקובץ', 'מחיקה והורדה מהירה'],
  },
] as const

export function getPaidAddonCatalogEntry(id: PaidAddonId): PaidAddonCatalogEntry | undefined {
  return PAID_ADDON_CATALOG.find((e) => e.id === id)
}

export function getLockedPaidAddons(
  enabledFeatures: SidebarNavItemId[] | null | undefined
): PaidAddonCatalogEntry[] {
  if (!enabledFeatures?.length) return []
  return PAID_ADDON_CATALOG.filter((entry) => !isNavFeatureEnabled(enabledFeatures, entry.id))
}

export function getLockedPaidAddonsCount(
  enabledFeatures: SidebarNavItemId[] | null | undefined
): number {
  return getLockedPaidAddons(enabledFeatures).length
}
