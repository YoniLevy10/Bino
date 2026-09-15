import type { Metadata } from 'next'
import { MarketingLanding } from './components/marketing/MarketingLanding'

export const metadata: Metadata = {
  title: 'BINO — זיכרון תפעולי חכם לבניינים',
  description:
    'BINO בונה זיכרון תפעולי לכל בניין: לומדת מהיסטוריית תקלות, ממליצה על עובדים וספקים, מזהה תקלות חוזרות ומוכיחה חיסכון לחברת הניהול.',
  openGraph: {
    title: 'BINO — זיכרון תפעולי חכם לבניינים',
    description:
      'לא עוד מערכת תקלות. BINO לומדת, מחליטה ומוכיחה כמה זמן וכסף נחסכו.',
    locale: 'he_IL',
  },
}

export default function MarketingHomePage() {
  return <MarketingLanding />
}
