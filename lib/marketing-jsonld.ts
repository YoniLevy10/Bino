import {
  BINO_MARKETING_DESCRIPTION,
  BINO_MARKETING_TITLE,
  getMarketingSiteOrigin,
} from '@/lib/marketing-site'
import { MARKETING_COPY, waDemoUrl } from '@/lib/marketing-copy'
import { getLegalSiteConfig } from '@/lib/legal-site-config'
import { getMarketingSocialSameAs } from '@/lib/marketing-social'

export function buildMarketingJsonLd() {
  const origin = getMarketingSiteOrigin()
  const copy = MARKETING_COPY.he
  const pageUrl = `${origin}/`
  const inLanguage = 'he'
  const legal = getLegalSiteConfig()
  const social = getMarketingSocialSameAs()
  const whatsappUrl = waDemoUrl('he', legal.phoneConfigured ? legal.phone : undefined)
  const sameAs = [whatsappUrl.split('?')[0], ...social]

  const graph: Record<string, unknown>[] = [
    {
      '@type': 'Organization',
      '@id': `${origin}/#organization`,
      name: legal.businessName || 'BINO',
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
      knowsLanguage: ['he'],
      contactPoint: [
        {
          '@type': 'ContactPoint',
          contactType: 'sales',
          availableLanguage: ['Hebrew'],
          areaServed: 'IL',
          url: `${origin}/contact`,
          telephone: legal.phoneConfigured ? legal.phone : '+972-54-810-2688',
        },
      ],
      sameAs,
    },
    {
      '@type': 'WebSite',
      '@id': `${origin}/#website`,
      url: `${origin}/`,
      name: 'BINO',
      alternateName: 'Building Intelligence & Operations',
      description: BINO_MARKETING_DESCRIPTION,
      inLanguage: 'he',
      publisher: { '@id': `${origin}/#organization` },
    },
    {
      '@type': 'WebPage',
      '@id': `${pageUrl}#webpage`,
      url: pageUrl,
      name: BINO_MARKETING_TITLE,
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
      alternateName: [
        'מערכת ניהול פרויקטים',
        'מערכת ניהול בניינים',
        'ניהול שטחים',
        'Building Intelligence & Operations',
      ],
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'Property / facilities / multi-site operations',
      operatingSystem: 'Web',
      url: `${origin}/`,
      description: BINO_MARKETING_DESCRIPTION,
      inLanguage: 'he',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'ILS',
        description: 'תיאום הדגמה',
      },
      featureList: [
        ...copy.steps.map((s) => s.title),
        'זיכרון תפעולי לפרויקטים, בניינים ושטחים',
      ],
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
  ]

  return {
    '@context': 'https://schema.org',
    '@graph': graph,
  }
}
