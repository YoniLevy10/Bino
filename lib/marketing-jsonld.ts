import {
  BINO_MARKETING_DESCRIPTION,
  BINO_MARKETING_TITLE,
  getMarketingSiteOrigin,
} from '@/lib/marketing-site'
import { MARKETING_COPY, type MarketingLocale } from '@/lib/marketing-copy'

export function buildMarketingJsonLd(locale: MarketingLocale = 'he') {
  const origin = getMarketingSiteOrigin()
  const copy = MARKETING_COPY[locale]
  const pageUrl = locale === 'en' ? `${origin}/en` : `${origin}/`
  const inLanguage = locale === 'en' ? 'en' : 'he'

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: 'BINO',
        legalName: 'BINO — Building Intelligence & Operations',
        url: `${origin}/`,
        logo: {
          '@type': 'ImageObject',
          url: `${origin}/apple-icon.png`,
          width: 1254,
          height: 1254,
        },
        description: BINO_MARKETING_DESCRIPTION,
        foundingDate: '2024',
        areaServed: [
          {
            '@type': 'Country',
            name: 'Israel',
          },
        ],
        knowsLanguage: ['he', 'en'],
        contactPoint: [
          {
            '@type': 'ContactPoint',
            contactType: 'sales',
            availableLanguage: ['Hebrew', 'English'],
            areaServed: 'IL',
            url: `${origin}/contact`,
            telephone: '+972-54-810-2688',
          },
        ],
        sameAs: [`https://wa.me/972548102688`],
      },
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        url: `${origin}/`,
        name: 'BINO',
        alternateName: 'Building Intelligence & Operations',
        description: BINO_MARKETING_DESCRIPTION,
        inLanguage: ['he', 'en'],
        publisher: { '@id': `${origin}/#organization` },
      },
      {
        '@type': 'WebPage',
        '@id': `${pageUrl}#webpage`,
        url: pageUrl,
        name: locale === 'en' ? 'BINO — Smart operational memory for buildings' : BINO_MARKETING_TITLE,
        description: copy.support,
        isPartOf: { '@id': `${origin}/#website` },
        about: { '@id': `${origin}/#software` },
        inLanguage,
        primaryImageOfPage: {
          '@type': 'ImageObject',
          url: `${origin}/opengraph-image`,
        },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${origin}/#software`,
        name: 'BINO',
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'Property management / facilities operations',
        operatingSystem: 'Web',
        url: `${origin}/`,
        description: BINO_MARKETING_DESCRIPTION,
        inLanguage: ['he', 'en'],
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'ILS',
          description: locale === 'en' ? 'Book a demo' : 'תיאום הדגמה',
        },
        featureList: copy.steps.map((s) => s.title),
        publisher: { '@id': `${origin}/#organization` },
      },
      {
        '@type': 'FAQPage',
        '@id': `${pageUrl}#faq`,
        mainEntity: copy.faq.map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: {
            '@type': 'Answer',
            text: item.a,
          },
        })),
      },
    ],
  }
}
