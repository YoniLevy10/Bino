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

/** ~50–60 chars for SEOptimer / SERP title length. */
export const BINO_MARKETING_TITLE = 'BINO — מערכת ניהול פרויקטים, בניינים ושטחים בישראל'

/** ~120–160 chars for meta description. */
export const BINO_MARKETING_DESCRIPTION =
  'BINO — מערכת ניהול פרויקטים, בניינים ושטחים לחברות ניהול בישראל. זיכרון תפעולי לכל אתר, שיוך חכם והוכחת חיסכון — לא רק ועד בית.'

export const BINO_MARKETING_OG_DESCRIPTION =
  'BINO — מערכת ניהול פרויקטים, בניינים ושטחים בישראל. זיכרון תפעולי והוכחת חיסכון — לא רק ועד בית.'

export const BINO_MARKETING_TITLE_EN =
  'BINO — Project, building & space management (Israel)'

export const BINO_MARKETING_DESCRIPTION_EN =
  'BINO — management system for projects, buildings, and spaces in Israel. Operational memory, smart assignment, and proven savings — not committee-only software.'

export const BINO_MARKETING_OG_DESCRIPTION_EN =
  'BINO — projects, buildings, and spaces for Israeli management companies. Operational memory and proven savings — not committee-only software.'
