import type { Metadata } from 'next'
import Link from 'next/link'
import { MarketingAnalytics } from '@/app/components/marketing/MarketingAnalytics'
import { SeoGuideShell } from '@/app/components/marketing/SeoGuideArticle'
import { SEO_GUIDES_HE } from '@/lib/seo-guides-he'
import { getMarketingSiteOrigin } from '@/lib/marketing-site'
import '@/app/components/marketing/seo-guide.css'

const origin = getMarketingSiteOrigin()

export const metadata: Metadata = {
  title: 'מדריכים לניהול פרויקטים, בניינים ושטחים | BINO',
  description:
    'מדריכים בעברית לחברות ניהול בישראל: מערכת ניהול פרויקטים, ניהול בניינים, ניהול שטחים, זיכרון תפעולי, תקלות חוזרות ו־SLA — לא רק ועד בית.',
  alternates: { canonical: `${origin}/guides` },
  openGraph: {
    title: 'מדריכים לניהול פרויקטים, בניינים ושטחים | BINO',
    description: 'תוכן אורגני בעברית — זיכרון תפעולי לפרויקטים ושטחים, לא רק מערכת תקלות.',
    url: `${origin}/guides`,
    locale: 'he_IL',
    type: 'website',
  },
  robots: { index: true, follow: true },
}

export default function GuidesIndexPage() {
  return (
    <>
      <MarketingAnalytics pagePath="/guides" />
      <SeoGuideShell backHref="/" backLabel="דף הבית">
        <div className="bino-guide__article">
          <p className="bino-guide__kicker">קידום אורגני · ישראל</p>
          <h1 className="bino-guide__h1">מדריכים לניהול פרויקטים, בניינים ושטחים</h1>
          <p className="bino-guide__intro">
            תוכן בעברית למי שמחפש מערכת ניהול פרויקטים, בניינים או שטחים בישראל — עם דגש על זיכרון
            תפעולי, מניעת תקלות חוזרות והוכחת חיסכון. לא תוכנת ועד בלבד, ולא מדריכי ״איך לפתוח קריאה״
            גנריים.
          </p>
          <ul className="bino-guide-index__list">
            {SEO_GUIDES_HE.map((guide) => (
              <li key={guide.slug} className="bino-guide-index__item">
                <Link href={`/guides/${guide.slug}`}>
                  <span className="bino-guide-index__title">{guide.title}</span>
                  <span className="bino-guide-index__desc">{guide.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </SeoGuideShell>
    </>
  )
}
