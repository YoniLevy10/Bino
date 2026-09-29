'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Outfit } from 'next/font/google'
import { useEffect, useState } from 'react'
import './marketing.css'
import {
  MARKETING_COPY,
  type MarketingLocale,
  storeMarketingLocale,
  waDemoUrl,
} from '@/lib/marketing-copy'
import { trackMarketingEvent } from '@/lib/marketing-analytics'
import { MarketingLeadLink } from './MarketingLeadLink'

const outfit = Outfit({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-bino-display',
  weight: ['500', '600', '700', '800'],
})

function CtaPair({
  locale,
  variant = 'hero',
}: {
  locale: MarketingLocale
  variant?: 'hero' | 'closing'
}) {
  const copy = MARKETING_COPY[locale]
  return (
    <div className="bino-cta">
      <MarketingLeadLink
        className="bino-cta__primary"
        href={waDemoUrl(locale)}
        target="_blank"
        rel="noopener noreferrer"
        method="whatsapp_demo"
        locale={locale}
        placement={variant}
      >
        {copy.ctaDemo}
      </MarketingLeadLink>
      <Link
        className={
          variant === 'closing' ? 'bino-cta__secondary bino-cta__secondary--dark' : 'bino-cta__secondary'
        }
        href="/login"
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

function LangSwitch({
  locale,
  onChange,
}: {
  locale: MarketingLocale
  onChange: (next: MarketingLocale) => void
}) {
  const copy = MARKETING_COPY[locale]
  return (
    <div className="bino-lang" role="group" aria-label={copy.langSwitchAria}>
      <button
        type="button"
        className={locale === 'he' ? 'bino-lang__btn is-active' : 'bino-lang__btn'}
        aria-pressed={locale === 'he'}
        onClick={() => onChange('he')}
      >
        {copy.langHe}
      </button>
      <span className="bino-lang__sep" aria-hidden="true">
        /
      </span>
      <button
        type="button"
        className={locale === 'en' ? 'bino-lang__btn is-active' : 'bino-lang__btn'}
        aria-pressed={locale === 'en'}
        onClick={() => onChange('en')}
      >
        {copy.langEn}
      </button>
    </div>
  )
}

export function MarketingLanding({ initialLocale = 'he' }: { initialLocale?: MarketingLocale }) {
  const router = useRouter()
  const [locale, setLocale] = useState<MarketingLocale>(initialLocale)

  useEffect(() => {
    setLocale(initialLocale)
    storeMarketingLocale(initialLocale)
  }, [initialLocale])

  function changeLocale(next: MarketingLocale) {
    storeMarketingLocale(next)
    setLocale(next)
    router.push(next === 'en' ? '/en' : '/')
  }

  const copy = MARKETING_COPY[locale]
  const heroShot = copy.shots[0]

  return (
    <div className={`bino-marketing ${outfit.variable}`} lang={copy.lang} dir={copy.dir}>
      <header className="bino-hero">
        <div className="bino-hero__plane" aria-hidden="true" />
        <div className="bino-hero__glow" aria-hidden="true" />
        <div className="bino-hero__top">
          <LangSwitch locale={locale} onChange={changeLocale} />
        </div>
        <div className="bino-hero__stage">
          <div className="bino-hero__copy">
            <h1 className="bino-brand">{copy.brand}</h1>
            <p className="bino-headline">{copy.headline}</p>
            <p className="bino-support">{copy.support}</p>
            <CtaPair locale={locale} />
          </div>
          <div className="bino-hero__visual">
            <div className="bino-device">
              <div className="bino-device__chrome">
                <span className="bino-device__dot" />
                <span className="bino-device__url">bino.casa</span>
              </div>
              {/* Local product mock — next/image optimization not required for marketing statics */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={heroShot.src}
                alt={heroShot.alt}
                width={960}
                height={640}
                className="bino-device__img"
                fetchPriority="high"
                decoding="async"
              />
            </div>
          </div>
        </div>
      </header>

      <main>
        <section className="bino-showcase" aria-labelledby="bino-showcase-heading">
          <div className="bino-section bino-section--wide">
            <h2 id="bino-showcase-heading" className="bino-section__title">
              {copy.showcaseTitle}
            </h2>
            <p className="bino-section__lead">{copy.showcaseLead}</p>
            <ul className="bino-showcase__grid">
              {copy.shots.map((shot) => (
                <li key={shot.src} className="bino-showcase__item">
                  <figure>
                    <div className="bino-showcase__frame">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={shot.src}
                        alt={shot.alt}
                        width={960}
                        height={640}
                        className="bino-showcase__img"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                    <figcaption className="bino-showcase__caption">{shot.caption}</figcaption>
                  </figure>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="bino-section" aria-labelledby="bino-metrics-heading">
          <h2 id="bino-metrics-heading" className="bino-section__title">
            {copy.metricsTitle}
          </h2>
          <p className="bino-section__lead">{copy.metricsLead}</p>
          <p className="bino-sample-note" role="note">
            {copy.sampleNote}
          </p>
          <ol className="bino-metrics">
            {copy.metrics.map((metric, i) => (
              <li key={metric.label}>
                <span className="bino-metrics__idx">{String(i + 1).padStart(2, '0')}</span>
                <div className="bino-metrics__body">
                  <span className="bino-metrics__label">{metric.label}</span>
                  <span className="bino-metrics__delta">
                    <span className="bino-metrics__before">{metric.before}</span>
                    <span className="bino-metrics__arrow" aria-hidden="true">
                      {locale === 'he' ? '←' : '→'}
                    </span>
                    <span className="bino-metrics__after">{metric.after}</span>
                    <span className="bino-metrics__note">{metric.note}</span>
                  </span>
                </div>
              </li>
            ))}
          </ol>
          <p className="bino-metrics__more">
            <Link href="/savings-report">{copy.metricsMore}</Link>
          </p>
        </section>

        <section className="bino-section" aria-labelledby="bino-how-heading">
          <h2 id="bino-how-heading" className="bino-section__title">
            {copy.howTitle}
          </h2>
          <p className="bino-section__lead">{copy.howLead}</p>
          <ol className="bino-steps">
            {copy.steps.map((step, i) => (
              <li key={step.title}>
                <span className="bino-steps__num">
                  {locale === 'he' ? `שלב ${i + 1}` : `Step ${i + 1}`}
                </span>
                <h3 className="bino-steps__title">{step.title}</h3>
                <p className="bino-steps__body">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="bino-section bino-faq" aria-labelledby="bino-faq-heading">
          <h2 id="bino-faq-heading" className="bino-section__title">
            {copy.faqTitle}
          </h2>
          <p className="bino-section__lead">{copy.faqLead}</p>
          <div className="bino-faq__list">
            {copy.faq.map((item) => (
              <details key={item.q} className="bino-faq__item">
                <summary className="bino-faq__q">{item.q}</summary>
                <p className="bino-faq__a">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="bino-closing" aria-labelledby="bino-closing-heading">
          <h2 id="bino-closing-heading" className="bino-closing__title">
            {copy.closingTitle}
          </h2>
          <CtaPair locale={locale} variant="closing" />
        </section>
      </main>

      <footer className="bino-footer">
        <span>{copy.footerTagline}</span>
        {' · '}
        <Link href="/privacy">{copy.privacy}</Link>
        {' · '}
        <Link href="/terms">{copy.terms}</Link>
        {' · '}
        <MarketingLeadLink href="/contact" method="contact_nav" locale={locale} placement="footer">
          {copy.contact}
        </MarketingLeadLink>
      </footer>
    </div>
  )
}
