/**
 * Absolute origin for public marketing SEO (sitemap, robots, metadataBase, JSON-LD).
 * Prefers NEXT_PUBLIC_APP_URL; falls back to Vercel deployment URL, then localhost.
 */
export function getMarketingSiteOrigin(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/$/, '')
  if (fromEnv) return fromEnv

  const vercel = (process.env.VERCEL_URL || '').trim().replace(/\/$/, '')
  if (vercel) {
    return vercel.startsWith('http') ? vercel : `https://${vercel}`
  }

  return 'http://localhost:3000'
}

export const BINO_MARKETING_TITLE = 'BINO — זיכרון תפעולי לפרויקטים, בניינים ושטחים'

export const BINO_MARKETING_DESCRIPTION =
  'BINO — מערכת ניהול פרויקטים, בניינים ושטחים לחברות ניהול בישראל: זיכרון תפעולי לכל אתר, שיוך חכם, מניעת תקלות חוזרות והוכחת חיסכון — לא רק ועד בית ולא רק מערכת תקלות.'

export const BINO_MARKETING_OG_DESCRIPTION =
  'לחברות ניהול בישראל: פרויקטים, בניינים ושטחים — לא עוד מערכת תקלות או תוכנת ועד בלבד. BINO לומדת, מחליטה ומוכיחה חיסכון.'
