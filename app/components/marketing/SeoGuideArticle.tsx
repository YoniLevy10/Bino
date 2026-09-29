import type { ReactNode } from 'react'
import Link from 'next/link'
import { MarketingLeadLink } from './MarketingLeadLink'
import type { SeoGuide } from '@/lib/seo-guides-he'
import { SEO_GUIDES_HE } from '@/lib/seo-guides-he'
import { waDemoUrl } from '@/lib/marketing-copy'
import './seo-guide.css'

const WA = waDemoUrl('he')

export function SeoGuideShell({
  children,
  backHref = '/guides',
  backLabel = 'כל המדריכים',
}: {
  children: ReactNode
  backHref?: string
  backLabel?: string
}) {
  return (
    <div className="bino-guide" lang="he" dir="rtl">
      <div className="bino-guide__bar">
        <Link className="bino-guide__brand" href="/">
          BINO
        </Link>
        <Link className="bino-guide__back" href={backHref}>
          {backLabel}
        </Link>
      </div>
      {children}
    </div>
  )
}

export function SeoGuideArticle({ guide }: { guide: SeoGuide }) {
  const related = SEO_GUIDES_HE.filter((g) => g.slug !== guide.slug).slice(0, 4)

  return (
    <SeoGuideShell>
      <article className="bino-guide__article">
        <p className="bino-guide__kicker">מדריך לחברות ניהול בישראל</p>
        <h1 className="bino-guide__h1">{guide.title}</h1>
        <p className="bino-guide__intro">{guide.intro}</p>

        {guide.sections.map((section) => (
          <section key={section.heading} className="bino-guide__section">
            <h2 className="bino-guide__h2">{section.heading}</h2>
            {section.paragraphs.map((p) => (
              <p key={p.slice(0, 40)} className="bino-guide__p">
                {p}
              </p>
            ))}
            {section.bullets?.length ? (
              <ul className="bino-guide__ul">
                {section.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}

        {guide.faq.length ? (
          <section className="bino-guide__faq" aria-labelledby="guide-faq-heading">
            <h2 id="guide-faq-heading" className="bino-guide__h2">
              שאלות נפוצות
            </h2>
            {guide.faq.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </section>
        ) : null}

        <div className="bino-guide__cta">
          <MarketingLeadLink
            className="bino-guide__cta-primary"
            href={WA}
            target="_blank"
            rel="noopener noreferrer"
            method="whatsapp_demo"
            locale="he"
            placement={`guide:${guide.slug}`}
          >
            {guide.ctaLabel}
          </MarketingLeadLink>
          <Link className="bino-guide__cta-secondary" href="/savings-report">
            דוח חיסכון לדוגמה
          </Link>
        </div>

        <nav className="bino-guide__related" aria-label="מדריכים נוספים">
          <h2>מדריכים נוספים לחברות ניהול</h2>
          <ul>
            {related.map((g) => (
              <li key={g.slug}>
                <Link href={`/guides/${g.slug}`}>{g.title}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </article>
    </SeoGuideShell>
  )
}
