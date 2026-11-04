'use client'

import Link from 'next/link'
import './marketing.css'
import {
  MARKETING_COPY,
  type MarketingCopy,
  type MarketingLocale,
} from '@/lib/marketing-copy'
import { trackMarketingEvent } from '@/lib/marketing-analytics'
import { BINO_PUBLIC_ORIGIN } from '@/lib/public-origin'
import { BINO_PUBLIC_HOST } from '@/lib/marketing-site'
import { MarketingLeadLink } from './MarketingLeadLink'
import { WhatsAppIcon } from './WhatsAppIcon'

function CtaPair({
  locale,
  whatsappHref,
  variant = 'hero',
}: {
  locale: MarketingLocale
  whatsappHref: string
  variant?: 'hero' | 'closing'
}) {
  const copy = MARKETING_COPY[locale]

  return (
    <div className="bino-cta">
      <MarketingLeadLink
        className="bino-cta__primary"
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        method="whatsapp_demo"
        locale={locale}
        placement={variant}
      >
        <WhatsAppIcon className="bino-whatsapp-icon" />
        {copy.ctaDemo}
      </MarketingLeadLink>
      <Link
        className={
          variant === 'closing'
            ? 'bino-cta__secondary bino-cta__secondary--dark'
            : 'bino-cta__secondary'
        }
        href={`${BINO_PUBLIC_ORIGIN}/login`}
        onClick={() =>
          trackMarketingEvent('login_click', {
            locale,
            placement: variant,
          })
        }
      >
        {copy.ctaLogin}
      </Link>
    </div>
  )
}

function MarketingHeader({ copy }: { copy: MarketingCopy }) {
  return (
    <header className="bino-page-header">
      <div className="bino-page-header__inner">
        <Link className="bino-brand-lockup" href="/" aria-label="BINO">
          <span className="bino-brand-lockup__mark" aria-hidden="true">
            B
          </span>
          <span className="bino-brand-lockup__word">BINO</span>
        </Link>

        <nav className="bino-page-nav" aria-label={copy.navLabel}>
          <a href="#product">{copy.navProduct}</a>
          <a href="#impact">{copy.navImpact}</a>
          <a href="#how">{copy.navHow}</a>
          <Link href="/guides">{copy.guides}</Link>
        </nav>

        <div className="bino-page-header__actions">
          <Link
            className="bino-header-login"
            href={`${BINO_PUBLIC_ORIGIN}/login`}
            onClick={() =>
              trackMarketingEvent('login_click', {
                locale: 'he',
                placement: 'header',
              })
            }
          >
            {copy.ctaLogin}
            <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
    </header>
  )
}

function HeroVisual({ copy }: { copy: MarketingCopy }) {
  const heroShot = copy.shots[1] ?? copy.shots[0]

  return (
    <div className="bino-home-hero__visual">
      <div className="bino-home-hero__visual-label">
        <span className="bino-status-dot" aria-hidden="true" />
        {copy.heroVisualLabel}
      </div>
      <div className="bino-hero-window">
        <div className="bino-hero-window__chrome">
          <span className="bino-hero-window__traffic" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="bino-hero-window__url" dir="ltr">
            {BINO_PUBLIC_HOST}
          </span>
          <span className="bino-hero-window__brand" dir="ltr">
            BINO
          </span>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={heroShot.src}
          alt={heroShot.alt}
          width={960}
          height={640}
          className="bino-hero-window__img"
          fetchPriority="high"
          decoding="async"
        />
      </div>
      <div className="bino-hero-visual__callout">
        <span className="bino-hero-visual__callout-mark" aria-hidden="true">
          ↗
        </span>
        <span>
          <strong>{copy.heroBadgeTitle}</strong>
          <small>{copy.heroBadgeText}</small>
        </span>
      </div>
    </div>
  )
}

export function MarketingLanding({ whatsappHref }: { whatsappHref: string }) {
  const locale: MarketingLocale = 'he'
  const copy = MARKETING_COPY.he

  return (
    <div className="bino-marketing bino-marketing--refresh" lang={copy.lang} dir={copy.dir}>
      <MarketingHeader copy={copy} />

      <main>
        <section className="bino-home-hero" aria-labelledby="bino-home-title">
          <div className="bino-home-hero__grid">
            <div className="bino-home-hero__copy">
              <p className="bino-eyebrow">
                <span className="bino-eyebrow__mark" aria-hidden="true" />
                {copy.heroEyebrow}
              </p>
              <h1 id="bino-home-title" className="bino-home-hero__title">
                {copy.headline}
              </h1>
              <p className="bino-home-hero__support">{copy.support}</p>
              <CtaPair locale={locale} whatsappHref={whatsappHref} />
            </div>
            <HeroVisual copy={copy} />
          </div>
        </section>

        <section className="bino-principles" aria-label={copy.proofAria}>
          <div className="bino-principles__inner">
            {copy.proofPoints.map((point, index) => (
              <article className="bino-principle" key={point.title}>
                <span className="bino-principle__index" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div>
                  <h2>{point.title}</h2>
                  <p>{point.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="bino-audience-section" aria-labelledby="bino-audience-heading">
          <div className="bino-audience-section__heading">
            <p className="bino-section-kicker">{copy.heroEyebrow}</p>
            <h2 id="bino-audience-heading">{copy.audienceTitle}</h2>
          </div>
          <div className="bino-audience-section__body">
            <p className="bino-section-lead">{copy.audienceLead}</p>
            <div className="bino-audience-section__paragraphs">
              {copy.audienceBody.map((paragraph) => (
                <p key={paragraph.slice(0, 48)}>{paragraph}</p>
              ))}
            </div>
          </div>
        </section>

        <section
          id="product"
          className="bino-product-section"
          aria-labelledby="bino-product-heading"
        >
          <div className="bino-content-width">
            <div className="bino-section-heading bino-section-heading--split">
              <div>
                <p className="bino-section-kicker">{copy.brand} / תפעול</p>
                <h2 id="bino-product-heading">{copy.showcaseTitle}</h2>
              </div>
              <p className="bino-section-lead">{copy.showcaseLead}</p>
            </div>

            <ul className="bino-product-grid">
              {copy.shots.map((shot, index) => (
                <li className="bino-product-card" key={shot.src}>
                  <figure>
                    <div className="bino-product-card__image-wrap">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={shot.src}
                        alt={shot.alt}
                        width={960}
                        height={640}
                        className="bino-product-card__image"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                    <figcaption className="bino-product-card__caption">
                      <span className="bino-product-card__index" aria-hidden="true">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span>{shot.caption}</span>
                    </figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="impact" className="bino-results" aria-labelledby="bino-results-heading">
          <div className="bino-content-width bino-results__inner">
            <div className="bino-results__heading">
              <div>
                <p className="bino-section-kicker">{copy.brand} / השפעה</p>
                <h2 id="bino-results-heading">{copy.metricsTitle}</h2>
                <p className="bino-results__lead">{copy.metricsLead}</p>
              </div>
              <p className="bino-results__sample-note" role="note">
                <span aria-hidden="true">i</span>
                {copy.sampleNote}
              </p>
            </div>

            <ol className="bino-results-grid">
              {copy.metrics.map((metric, index) => (
                <li className="bino-result-card" key={metric.label}>
                  <span className="bino-result-card__label">{metric.label}</span>
                  <div className="bino-result-card__comparison">
                    <span className="bino-result-card__before">{metric.before}</span>
                    <span className="bino-result-card__arrow" aria-hidden="true">
                      ←
                    </span>
                    <strong>{metric.after}</strong>
                  </div>
                  <span className="bino-result-card__note">{metric.note}</span>
                  <span className="bino-result-card__index" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </li>
              ))}
            </ol>
            <p className="bino-results__more">
              <Link href="/savings-report">{copy.metricsMore}<span aria-hidden="true">↗</span></Link>
            </p>
          </div>
        </section>

        <section id="how" className="bino-how-section" aria-labelledby="bino-how-heading">
          <div className="bino-content-width">
            <div className="bino-section-heading">
              <p className="bino-section-kicker">{copy.brand} / תהליך העבודה</p>
              <h2 id="bino-how-heading">{copy.howTitle}</h2>
              <p className="bino-section-lead">{copy.howLead}</p>
            </div>
            <ol className="bino-how-grid">
              {copy.steps.map((step, index) => (
                <li className="bino-how-card" key={step.title}>
                  <span className="bino-how-card__number" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="bino-faq-section" aria-labelledby="bino-faq-heading">
          <div className="bino-content-width bino-faq-section__inner">
            <div className="bino-faq-section__heading">
              <p className="bino-section-kicker">{copy.brand} / שאלות נפוצות</p>
              <h2 id="bino-faq-heading">{copy.faqTitle}</h2>
              <p className="bino-section-lead">{copy.faqLead}</p>
            </div>
            <div className="bino-faq-list">
              {copy.faq.map((item) => (
                <details key={item.q} className="bino-faq-item">
                  <summary>
                    <span>{item.q}</span>
                    <span className="bino-faq-item__toggle" aria-hidden="true" />
                  </summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bino-closing-section" aria-labelledby="bino-closing-heading">
          <div className="bino-closing-panel">
            <p className="bino-section-kicker">{copy.brand} / הצעד הבא</p>
            <h2 id="bino-closing-heading">{copy.closingTitle}</h2>
            <CtaPair locale={locale} whatsappHref={whatsappHref} variant="closing" />
          </div>
        </section>
      </main>

      <footer className="bino-footer-refresh">
        <div className="bino-footer-refresh__inner">
          <span>{copy.footerTagline}</span>
          <nav aria-label={copy.navLabel}>
            <Link href="/guides">{copy.guides}</Link>
            <Link href="/privacy">{copy.privacy}</Link>
            <Link href="/terms">{copy.terms}</Link>
            <MarketingLeadLink href="/contact" method="contact_nav" locale={locale} placement="footer">
              {copy.contact}
            </MarketingLeadLink>
          </nav>
        </div>
      </footer>
    </div>
  )
}
