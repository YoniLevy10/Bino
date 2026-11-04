import Script from 'next/script'
import {
  getMarketingGaMeasurementId,
  isValidGaMeasurementId,
  type MarketingPagePath,
} from '@/lib/marketing-analytics'

type MarketingAnalyticsProps = {
  /** Public marketing path only — never private/app routes. */
  pagePath?: MarketingPagePath
}

/**
 * Official Google tag (gtag.js) on public marketing pages only.
 * Next Script loads analytics after hydration without rendering unmanaged script tags.
 * Private app routes and tokenized URLs stay out of GA4.
 */
export function MarketingAnalytics({ pagePath = '/' }: MarketingAnalyticsProps) {
  const measurementId = getMarketingGaMeasurementId()
  if (!isValidGaMeasurementId(measurementId)) return null

  const measurementIdJson = JSON.stringify(measurementId)
  const pagePathJson = JSON.stringify(pagePath).replace(/</g, '\\u003c')

  return (
    <>
      <Script
        id="google-analytics-gtag"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config',${measurementIdJson},{page_path:${pagePathJson}});`,
        }}
      />
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
    </>
  )
}
