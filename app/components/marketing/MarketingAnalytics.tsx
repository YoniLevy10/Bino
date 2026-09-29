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
 * Server-rendered inline `gtag('config', …)` so GA Admin / Tag Assistant
 * can detect the install from HTML (https://support.google.com/analytics/answer/9304153).
 * Private app routes and tokenized URLs stay out of GA4.
 */
export function MarketingAnalytics({ pagePath: _pagePath = '/' }: MarketingAnalyticsProps) {
  const measurementId = getMarketingGaMeasurementId()
  if (!isValidGaMeasurementId(measurementId)) return null

  // Official Google tag snippet — must appear in document HTML for GA Admin "connected" checks.
  return (
    <>
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} />
      <script
        id="google-analytics-gtag"
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${measurementId}');`,
        }}
      />
    </>
  )
}
