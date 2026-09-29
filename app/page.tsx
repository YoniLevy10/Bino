import type { Metadata } from 'next'
import { MarketingLanding } from './components/marketing/MarketingLanding'
import { buildMarketingJsonLd } from '@/lib/marketing-jsonld'
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
  keywords: [
    'BINO',
    'זיכרון תפעולי',
    'ניהול בניינים',
    'חברת ניהול',
    'תחזוקת בניינים',
    'תקלות חוזרות',
    'SLA',
    'WhatsApp דיירים',
    'building operations',
    'property management Israel',
  ],
  alternates: {
    canonical: `${origin}/`,
    languages: {
      he: `${origin}/`,
      en: `${origin}/en`,
      'x-default': `${origin}/`,
    },
  },
  openGraph: {
    title: BINO_MARKETING_TITLE,
    description: BINO_MARKETING_OG_DESCRIPTION,
    locale: 'he_IL',
    alternateLocale: ['en_US'],
    url: `${origin}/`,
    type: 'website',
    siteName: 'BINO',
  },
  twitter: {
    card: 'summary_large_image',
    title: BINO_MARKETING_TITLE,
    description: BINO_MARKETING_OG_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
}

export default function MarketingHomePage() {
  const jsonLd = buildMarketingJsonLd('he')

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingLanding initialLocale="he" />
    </>
  )
}
