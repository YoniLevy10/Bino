import { PAID_ADDON_KEYS, type PaidAddonKey } from '@/lib/paid-addons'

/** UI hints per add-on — catalog rows still come from DB (name, price, description). */
export const PAID_ADDON_CARD_META: Record<
  PaidAddonKey,
  { featureHref: string; featureCtaHe: string; highlights: string[] }
> = {
  [PAID_ADDON_KEYS.professionals]: {
    featureHref: '/professionals',
    featureCtaHe: 'לפנקס אנשי מקצוע',
    highlights: [
      'פנקס קבלנים חיצוניים לפי מקצוע',
      'העברת תקלה ב-SMS עם פרטי בניין ודייר',
      'סטטוס ליווי איש מקצוע בתקלה',
    ],
  },
  [PAID_ADDON_KEYS.worker_stamp]: {
    featureHref: '/attendance',
    featureCtaHe: 'לחתמת עובדים',
    highlights: [
      'נוכחות עובדי שטח — QR ו-NFC',
      'משמרות, דוחות וסנכרון Offline',
      'תגי QR מונפקים על ידי במקור',
    ],
  },
}
