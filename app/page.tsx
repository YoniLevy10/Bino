import type { Metadata } from 'next'
import { MarketingLanding } from './components/marketing/MarketingLanding'
import {
  BINO_MARKETING_DESCRIPTION,
  BINO_MARKETING_OG_DESCRIPTION,
  BINO_MARKETING_TITLE,
  getMarketingSiteOrigin,
} from '@/lib/marketing-site'

const origin = getMarketingSiteOrigin()

export const metadata: Metadata = {
  title: BINO_MARKETING_TITLE,
  description: BINO_MARKETING_DESCRIPTION,
  alternates: {
    canonical: `${origin}/`,
    languages: { he: `${origin}/` },
  },
  openGraph: {
    title: BINO_MARKETING_TITLE,
    description: BINO_MARKETING_OG_DESCRIPTION,
    locale: 'he_IL',
    url: `${origin}/`,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: BINO_MARKETING_TITLE,
    description: BINO_MARKETING_OG_DESCRIPTION,
  },
}

function buildJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${origin}/#organization`,
        name: 'BINO',
        url: `${origin}/`,
        logo: `${origin}/apple-icon.png`,
        description: BINO_MARKETING_DESCRIPTION,
        foundingDate: '2024',
        areaServed: {
          '@type': 'Country',
          name: 'Israel',
        },
      },
      {
        '@type': 'WebSite',
        '@id': `${origin}/#website`,
        url: `${origin}/`,
        name: 'BINO',
        description: BINO_MARKETING_DESCRIPTION,
        inLanguage: 'he',
        publisher: { '@id': `${origin}/#organization` },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${origin}/#software`,
        name: 'BINO',
        applicationCategory: 'BusinessApplication',
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
        publisher: { '@id': `${origin}/#organization` },
      },
    ],
  }
}

export default function MarketingHomePage() {
  const jsonLd = buildJsonLd()

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingLanding />
    </>
  )
}
