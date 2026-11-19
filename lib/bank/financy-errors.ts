/**
 * Map Financy API error bodies to Hebrew operator messages.
 */

export function formatFinancyError(input: {
  status?: number
  type?: string | null
  message?: string | null
  error?: string | null
  reason?: string | null
}): string {
  const type = (input.type || '').toUpperCase()
  const raw =
    input.message ||
    input.error ||
    input.reason ||
    (input.status ? `Financy HTTP ${input.status}` : 'שגיאת Financy')

  if (type === 'NOT_AVAILABLE_ON_PLAN' || /NOT_AVAILABLE_ON_PLAN|paid plans only/i.test(raw)) {
    return 'ה־API של Financy זמין רק בתוכנית בתשלום (Starter/Pro). שדרגו ב־Financy ואז נסו שוב.'
  }
  if (type === 'ACCOUNT_LIMIT_REACHED' || /corporate-account limit/i.test(raw)) {
    return 'הגעתם למגבלת חשבונות בתוכנית Financy. שדרגו או הסירו חשבון, ואז נסו שוב.'
  }
  if (input.status === 401 || /unauthorized/i.test(raw)) {
    return 'מפתחות לא תקינים או שפג תוקפם. בדקו userId / clientId / clientSecret ב־גישה ל-API (ואם סובבתם מפתח — העתיקו את החדש).'
  }
  if (input.status === 402 || /insufficient credits/i.test(raw)) {
    return 'אין מספיק קרדיטים ב־Financy לרענון. בדקו יתרה באפליקציה.'
  }
  if (/column clients\.financy_|does not exist/i.test(raw)) {
    return 'סכמת Financy עדיין לא הותקנה בדאטאבייס (migration 143). הריצו את supabase/migrations/143_financy_bank_os.sql בפרוד.'
  }
  if (/debtor or the creditor account must be one of your own connected accounts/i.test(raw)) {
    return 'העברה דורשת שחשבון המשלם יהיה חשבון בנק מחובר ב־Financy. סנכרנו חשבון עו״ש ואז נסו שוב.'
  }
  return raw
}

export function extractFinancyErrorFields(json: unknown, status?: number) {
  const obj = json && typeof json === 'object' ? (json as Record<string, unknown>) : null
  return {
    status,
    type: typeof obj?.type === 'string' ? obj.type : null,
    message: typeof obj?.message === 'string' ? obj.message : null,
    error: typeof obj?.error === 'string' ? obj.error : null,
    reason: typeof obj?.reason === 'string' ? obj.reason : null,
  }
}
