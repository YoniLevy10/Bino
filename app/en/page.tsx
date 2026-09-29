import type { Metadata } from 'next'
import { MarketingLanding } from '@/app/components/marketing/MarketingLanding'
import { MarketingAnalytics } from '@/app/components/marketing/MarketingAnalytics'
import { buildMarketingJsonLd } from '@/lib/marketing-jsonld'
import { getLegalSiteConfig, legalTelHref } from '@/lib/legal-site-config'
import {
  BINO_MARKETING_DESCRIPTION_EN,
  BINO_MARKETING_OG_DESCRIPTION_EN,
  BINO_MARKETING_TITLE_EN,
  getMarketingSiteOrigin,
} from '@/lib/marketing-site'

const origin = getMarketingSiteOrigin()

export const metadata: Metadata = {
  title: BINO_MARKETING_TITLE_EN,
  description: BINO_MARKETING_DESCRIPTION_EN,
  alternates: {
    canonical: `${origin}/en`,
    languages: {
      he: `${origin}/`,
      en: `${origin}/en`,
      'x-default': `${origin}/`,
    },
  },
  openGraph: {
    title: BINO_MARKETING_TITLE_EN,
    description: BINO_MARKETING_OG_DESCRIPTION_EN,
    locale: 'en_US',
    alternateLocale: ['he_IL'],
    url: `${origin}/en`,
    type: 'website',
    siteName: 'BINO',
  },
  twitter: {
    card: 'summary_large_image',
    title: BINO_MARKETING_TITLE_EN,
    description: BINO_MARKETING_OG_DESCRIPTION_EN,
  },
}

export default function EnglishMarketingPage() {
  const jsonLd = buildMarketingJsonLd('en')
  const legal = getLegalSiteConfig()
  const nap = legal.readyForGrowAudit
    ? {
        phoneDisplay: legal.phoneDisplay,
        phoneHref: legalTelHref(legal.phone),
        address: legal.address,
      }
    : null

  return (
    <>
      <MarketingAnalytics pagePath="/en" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MarketingLanding initialLocale="en" nap={nap} />
    </>
  )
}
