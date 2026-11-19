/**
 * All israeli-bank-scrapers CompanyTypes + login fields for UI.
 * OTP banks: with BUILDING_BANK_SCRAPER_SHOW_BROWSER=true the Chromium window
 * can complete OTP manually on local runs.
 */

export const SCRAPER_PROVIDERS = [
  {
    id: 'leumi',
    labelHe: 'בנק לאומי',
    otp: false,
    fields: [
      { key: 'username', labelHe: 'שם משתמש', type: 'text' },
      { key: 'password', labelHe: 'סיסמה', type: 'password' },
    ],
  },
  {
    id: 'hapoalim',
    labelHe: 'בנק הפועלים',
    otp: 'conditional',
    fields: [
      { key: 'userCode', labelHe: 'קוד משתמש', type: 'text' },
      { key: 'password', labelHe: 'סיסמה', type: 'password' },
    ],
  },
  {
    id: 'mizrahi',
    labelHe: 'מזרחי טפחות',
    otp: false,
    fields: [
      { key: 'username', labelHe: 'שם משתמש', type: 'text' },
      { key: 'password', labelHe: 'סיסמה', type: 'password' },
    ],
  },
  {
    id: 'discount',
    labelHe: 'דיסקונט',
    otp: false,
    fields: [
      { key: 'id', labelHe: 'תעודת זהות', type: 'text' },
      { key: 'num', labelHe: 'מספר משתמש / סניף', type: 'text' },
      { key: 'password', labelHe: 'סיסמה', type: 'password' },
    ],
  },
  {
    id: 'mercantile',
    labelHe: 'מרכנתיל',
    otp: false,
    fields: [
      { key: 'id', labelHe: 'תעודת זהות', type: 'text' },
      { key: 'num', labelHe: 'מספר משתמש / סניף', type: 'text' },
      { key: 'password', labelHe: 'סיסמה', type: 'password' },
    ],
  },
  {
    id: 'otsarHahayal',
    labelHe: 'אוצר החייל',
    otp: 'conditional',
    fields: [
      { key: 'username', labelHe: 'שם משתמש', type: 'text' },
      { key: 'password', labelHe: 'סיסמה', type: 'password' },
    ],
  },
  {
    id: 'yahav',
    labelHe: 'בנק יהב',
    otp: false,
    fields: [
      { key: 'num', labelHe: 'מספר חשבון / משתמש', type: 'text' },
      { key: 'nationalID', labelHe: 'תעודת זהות', type: 'text' },
      { key: 'password', labelHe: 'סיסמה', type: 'password' },
    ],
  },
  {
    id: 'massad',
    labelHe: 'בנק מסד',
    otp: 'conditional',
    fields: [
      { key: 'username', labelHe: 'שם משתמש', type: 'text' },
      { key: 'password', labelHe: 'סיסמה', type: 'password' },
    ],
  },
  {
    id: 'beinleumi',
    labelHe: 'הבינלאומי',
    otp: 'conditional',
    fields: [
      { key: 'username', labelHe: 'שם משתמש', type: 'text' },
      { key: 'password', labelHe: 'סיסמה', type: 'password' },
    ],
  },
  {
    id: 'pagi',
    labelHe: 'פאג״י',
    otp: 'conditional',
    fields: [
      { key: 'username', labelHe: 'שם משתמש', type: 'text' },
      { key: 'password', labelHe: 'סיסמה', type: 'password' },
    ],
  },
  {
    id: 'union',
    labelHe: 'איגוד / יוניון',
    otp: false,
    fields: [
      { key: 'username', labelHe: 'שם משתמש', type: 'text' },
      { key: 'password', labelHe: 'סיסמה', type: 'password' },
    ],
  },
  {
    id: 'oneZero',
    labelHe: 'One Zero (משיכה חיה חסומה זמנית — Cloudflare; השתמשו ב־CSV)',
    otp: true,
    fields: [
      { key: 'email', labelHe: 'אימייל', type: 'text' },
      { key: 'password', labelHe: 'סיסמה', type: 'password' },
      {
        key: 'phoneNumber',
        labelHe: 'טלפון ל־OTP (חובה +972…)',
        type: 'text',
        placeholder: '+972541234567',
      },
    ],
  },
  {
    id: 'max',
    labelHe: 'Max (כרטיס)',
    otp: false,
    fields: [
      { key: 'username', labelHe: 'שם משתמש', type: 'text' },
      { key: 'password', labelHe: 'סיסמה', type: 'password' },
    ],
  },
  {
    id: 'isracard',
    labelHe: 'ישראכרט',
    otp: false,
    fields: [
      { key: 'id', labelHe: 'תעודת זהות', type: 'text' },
      { key: 'card6Digits', labelHe: '6 ספרות בכרטיס', type: 'text' },
      { key: 'password', labelHe: 'סיסמה', type: 'password' },
    ],
  },
  {
    id: 'amex',
    labelHe: 'אמריקן אקספרס',
    otp: false,
    fields: [
      { key: 'id', labelHe: 'תעודת זהות', type: 'text' },
      { key: 'card6Digits', labelHe: '6 ספרות בכרטיס', type: 'text' },
      { key: 'password', labelHe: 'סיסמה', type: 'password' },
    ],
  },
  {
    id: 'visaCal',
    labelHe: 'ויזה כאל',
    otp: false,
    fields: [
      { key: 'username', labelHe: 'שם משתמש', type: 'text' },
      { key: 'password', labelHe: 'סיסמה', type: 'password' },
    ],
  },
  {
    id: 'beyahadBishvilha',
    labelHe: 'ביחד בשבילך',
    otp: false,
    fields: [
      { key: 'id', labelHe: 'תעודת זהות', type: 'text' },
      { key: 'password', labelHe: 'סיסמה', type: 'password' },
    ],
  },
  {
    id: 'behatsdaa',
    labelHe: 'בהצדעה',
    otp: false,
    fields: [
      { key: 'id', labelHe: 'תעודת זהות', type: 'text' },
      { key: 'password', labelHe: 'סיסמה', type: 'password' },
    ],
  },
] as const

export type ScraperProviderId = (typeof SCRAPER_PROVIDERS)[number]['id']

export function isScraperProviderId(v: string): v is ScraperProviderId {
  return SCRAPER_PROVIDERS.some((p) => p.id === v)
}

export function getScraperProvider(id: string) {
  return SCRAPER_PROVIDERS.find((p) => p.id === id) || null
}
