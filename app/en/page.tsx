import type { Metadata } from 'next'
import { MarketingLanding } from '@/app/components/marketing/MarketingLanding'
import { buildMarketingJsonLd } from '@/lib/marketing-jsonld'
import { getMarketingSiteOrigin } from '@/lib/marketing-site'

const origin = getMarketingSiteOrigin()

const TITLE = 'BINO — Smart operational memory for buildings'
const DESCRIPTION =
  'BINO builds operational memory for every building: learns from ticket history, recommends workers and vendors, detects recurring failures, and proves savings for the management company.'
const OG =
  'Not another ticketing system. BINO learns, decides, and proves how much time and money were saved.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: `${origin}/en`,
    languages: {
      he: `${origin}/`,
      en: `${origin}/en`,
      'x-default': `${origin}/`,
    },
  },
  openGraph: {
    title: TITLE,
    description: OG,
    locale: 'en_US',
    alternateLocale: ['he_IL'],
    url: `${origin}/en`,
    type: 'website',
    siteName: 'BINO',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: OG,
  },
}

export default function EnglishMarketingPage() {
  const jsonLd = buildMarketingJsonLd('en')

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingLanding initialLocale="en" />
    </>
  )
}
