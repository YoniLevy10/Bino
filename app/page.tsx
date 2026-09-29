import type { Metadata } from 'next'
import { MarketingLanding } from './components/marketing/MarketingLanding'
import { MarketingAnalytics } from './components/marketing/MarketingAnalytics'
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
    'מערכת ניהול בניינים',
    'חברת ניהול בישראל',
    'זיכרון תפעולי',
    'ניהול בניינים',
    'תחזוקת בניינים',
    'תקלות חוזרות',
    'דיווח תקלות וואטסאפ',
    'SLA תחזוקה',
    'תוכנה לחברת ניהול',
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
      <MarketingAnalytics pagePath="/" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingLanding initialLocale="he" />
    </>
  )
}
