import type { Metadata } from 'next'
import Link from 'next/link'
import { MarketingAnalytics } from '@/app/components/marketing/MarketingAnalytics'
import { MarketingLeadLink } from '@/app/components/marketing/MarketingLeadLink'
import { SeoGuideShell } from '@/app/components/marketing/SeoGuideArticle'
import '@/app/components/marketing/seo-guide.css'
import '@/app/components/marketing/developers-page.css'
import { getLegalSiteConfig } from '@/lib/legal-site-config'
import { waDemoUrl } from '@/lib/marketing/marketing-copy'
import { getMarketingSiteOrigin } from '@/lib/marketing/marketing-site'
import {
  DEVELOPERS_CAPABILITIES,
  DEVELOPERS_DESCRIPTION_HE,
  DEVELOPERS_FAQ_HE,
  DEVELOPERS_MCP_TOOLS_PREVIEW,
  DEVELOPERS_PATH,
  DEVELOPERS_TITLE_EN,
  DEVELOPERS_TITLE_HE,
  buildDevelopersJsonLd,
} from '@/lib/seo/developers-page'

const origin = getMarketingSiteOrigin()

export const metadata: Metadata = {
  title: DEVELOPERS_TITLE_HE,
  description: DEVELOPERS_DESCRIPTION_HE,
  keywords: [
    'BINO MCP',
    'building ops MCP',
    'property API',
    'Partner API בניין',
    'MCP API בניין',
    'תחזוקה AI',
    'תקלות AI',
    'זיכרון תפעולי API',
    'Cursor MCP buildings',
    'open platform building management',
  ],
  alternates: {
    canonical: `${origin}${DEVELOPERS_PATH}`,
    languages: {
      'he-IL': `${origin}${DEVELOPERS_PATH}`,
      en: `${origin}${DEVELOPERS_PATH}#en`,
    },
  },
  openGraph: {
    title: DEVELOPERS_TITLE_HE,
    description: DEVELOPERS_DESCRIPTION_HE,
    url: `${origin}${DEVELOPERS_PATH}`,
    locale: 'he_IL',
    type: 'website',
    siteName: 'BINO',
  },
  twitter: {
    card: 'summary_large_image',
    title: DEVELOPERS_TITLE_HE,
    description: DEVELOPERS_DESCRIPTION_HE,
  },
  robots: { index: true, follow: true },
}

export default function DevelopersPage() {
  const jsonLd = buildDevelopersJsonLd()
  const legal = getLegalSiteConfig()
  const whatsappHref = waDemoUrl('he', legal.phoneConfigured ? legal.phone : undefined)

  return (
    <>
      <MarketingAnalytics pagePath="/developers" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SeoGuideShell backHref="/" backLabel="דף הבית">
        <div className="bino-guide__article bino-dev" lang="he" dir="rtl">
          <p className="bino-guide__kicker">Open platform · MCP · Partner API</p>
          <h1 className="bino-guide__h1">
            BINO למפתחים ושותפים — MCP ו־API לזיכרון תפעולי של בניינים
          </h1>
          <p className="bino-guide__intro">
            כשמחפשים פלטפורמת תחזוקה חכמה, MCP לבניינים, או API לנכסים — BINO לא אמורה להיעלם.
            אנחנו בונים שכבה פתוחה לסוכני AI (Cursor קודם) ולשותפים ישראליים: קריאה של זיכרון
            תפעולי, אותות החלטה, ומדדי חיסכון — לא עוד CRUD של תקלות.
          </p>

          <p className="bino-dev__status">
            סטטוס: דף גילוי + כיוון מוצר. מפתחות קריאה בחינם עם rate limit הם ברירת המחדל
            המסחרית; הנפקת מפתחות חיה תגיע עם Partner API P1. אין כאן הבטחת endpoints פיקטיביים.
          </p>

          <div className="bino-dev__grid" role="list">
            {DEVELOPERS_CAPABILITIES.map((cap) => (
              <div key={cap.titleHe} className="bino-dev__card" role="listitem">
                <h3>{cap.titleHe}</h3>
                <p>{cap.bodyHe}</p>
              </div>
            ))}
          </div>

          <section className="bino-guide__section" aria-labelledby="dev-mcp-heading">
            <h2 id="dev-mcp-heading" className="bino-guide__h2">
              MCP ל־Cursor — כלים שמחליטים, לא רק רשימות
            </h2>
            <p className="bino-guide__p">
              שמות הכלים מכוונים לשיפוט תפעולי. אותה שכבת הרשאות כמו Partner API — בלי לעקוף
              tenant isolation.
            </p>
            <ul className="bino-dev__tools">
              {DEVELOPERS_MCP_TOOLS_PREVIEW.map((tool) => (
                <li key={tool}>
                  <code>{tool}</code>
                </li>
              ))}
            </ul>
          </section>

          <section className="bino-guide__section" aria-labelledby="dev-audience-heading">
            <h2 id="dev-audience-heading" className="bino-guide__h2">
              למי זה מיועד עכשיו
            </h2>
            <ul className="bino-guide__ul">
              <li>פלטפורמות AI וסוכנים שצריכים זיכרון בניין אמיתי — לא צ׳אט בלי הקשר</li>
              <li>שותפים ישראליים של חברות ניהול שרוצים לשלב BINO בלי לבנות מחדש את הליבה</li>
              <li>מגדלים בינלאומיים: נרטיב מוכן; מכירה ראשונה נשארת ישראל + AI</li>
            </ul>
          </section>

          <section className="bino-guide__faq" aria-labelledby="dev-faq-heading">
            <h2 id="dev-faq-heading" className="bino-guide__h2">
              שאלות נפוצות
            </h2>
            {DEVELOPERS_FAQ_HE.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </section>

          <div className="bino-guide__cta">
            <MarketingLeadLink
              className="bino-guide__cta-primary"
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              method="whatsapp_demo"
              locale="he"
              placement="developers"
            >
              לתיאום גישת שותף / הדגמה
            </MarketingLeadLink>
            <Link className="bino-guide__cta-secondary" href="/guides/mcp-api-binyanim">
              מדריך MCP / API בעברית
            </Link>
            <Link className="bino-guide__cta-secondary" href="/guides/tachzuka-ai-binyanim">
              תחזוקה AI לבניינים
            </Link>
          </div>

          <section id="en" className="bino-dev__en" lang="en" dir="ltr" aria-labelledby="dev-en-heading">
            <h2 id="dev-en-heading">{DEVELOPERS_TITLE_EN.replace(' | BINO', '')}</h2>
            <p>
              When agents and partners search for building ops MCP, property APIs, or AI
              maintenance platforms, they should land on BINO — Building Intelligence &amp;
              Operations. We expose operational memory, decision signals, and savings KPIs, not
              generic ticket CRUD.
            </p>
            <p>
              Defaults: Cursor-first MCP, then ChatGPT Actions on the same REST surface; free
              rate-limited read keys first, paid later when writes/webhooks exist. Primary GTM:
              AI platforms + Israeli management partners; international towers later.
            </p>
            <p>
              {DEVELOPERS_CAPABILITIES.map((c) => c.titleEn).join(' · ')}.
            </p>
          </section>

          <nav className="bino-guide__related" aria-label="קישורים נוספים">
            <h2>המשך גילוי</h2>
            <ul>
              <li>
                <Link href="/guides">מדריכים לחברות ניהול</Link>
              </li>
              <li>
                <Link href="/savings-report">דוח חיסכון לדוגמה</Link>
              </li>
              <li>
                <Link href="/en">English marketing</Link>
              </li>
            </ul>
          </nav>
        </div>
      </SeoGuideShell>
    </>
  )
}
