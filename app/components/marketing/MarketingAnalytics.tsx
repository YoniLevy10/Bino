'use client'

import { useEffect, useRef } from 'react'
import Script from 'next/script'
import {
  getMarketingGaMeasurementId,
  isValidGaMeasurementId,
  type MarketingPagePath,
} from '@/lib/marketing-analytics'

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

type MarketingAnalyticsProps = {
  /** Public marketing path only — never private/app routes. */
  pagePath?: MarketingPagePath
}

/**
 * Official Google tag (gtag.js) on public marketing pages only.
 * Inline `gtag('config', …)` matches GA Admin / Tag Assistant install checks
 * (see https://support.google.com/analytics/answer/9304153).
 * Private app routes and tokenized URLs stay out of GA4.
 */
export function MarketingAnalytics({ pagePath = '/' }: MarketingAnalyticsProps) {
  const measurementId = getMarketingGaMeasurementId()
  const enabled = isValidGaMeasurementId(measurementId)
  const lastPathRef = useRef<string | null>(null)

  // SPA navigations between marketing pages — first hit comes from gtag('config').
  useEffect(() => {
    if (!enabled) return
    if (typeof window.gtag !== 'function') return
    if (lastPathRef.current === null) {
      lastPathRef.current = pagePath
      return
    }
    if (lastPathRef.current === pagePath) return
    lastPathRef.current = pagePath
    window.gtag('event', 'page_view', {
      page_title: document.title,
      page_location: window.location.origin + pagePath,
      page_path: pagePath,
    })
  }, [enabled, pagePath])

  if (!enabled) return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics-gtag" strategy="afterInteractive">
        {`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${measurementId}');
`}
      </Script>
    </>
  )
}
