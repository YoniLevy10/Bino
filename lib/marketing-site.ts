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

export const BINO_MARKETING_TITLE = 'BINO — זיכרון תפעולי חכם לבניינים בישראל'

export const BINO_MARKETING_DESCRIPTION =
  'BINO — מערכת לחברות ניהול בניינים בישראל: בונה זיכרון תפעולי לכל בניין, לומדת מהיסטוריית תקלות, ממליצה על עובדים וספקים, מזהה תקלות חוזרות ומוכיחה חיסכון.'

export const BINO_MARKETING_OG_DESCRIPTION =
  'לחברות ניהול בישראל: לא עוד מערכת תקלות. BINO לומדת, מחליטה ומוכיחה כמה זמן וכסף נחסכו.'
