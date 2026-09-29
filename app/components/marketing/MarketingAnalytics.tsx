'use client'

import { useEffect } from 'react'
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
    binoAnalyticsInitialized?: boolean
  }
}

type MarketingAnalyticsProps = {
  /** Public marketing path only — never private/app routes. */
  pagePath?: MarketingPagePath
}

/**
 * Measure public marketing pages only (property: bino / bino.casa).
 * Private app routes and tokenized URLs stay out of GA4.
 */
export function MarketingAnalytics({ pagePath = '/' }: MarketingAnalyticsProps) {
  const measurementId = getMarketingGaMeasurementId()
  const enabled = isValidGaMeasurementId(measurementId)

  useEffect(() => {
    if (!enabled) return

    window.dataLayer = window.dataLayer || []
    window.gtag =
      window.gtag ||
      function gtag(...args: unknown[]) {
        window.dataLayer.push(args)
      }

    if (!window.binoAnalyticsInitialized) {
      window.gtag('js', new Date())
      window.gtag('config', measurementId, {
        send_page_view: false,
        anonymize_ip: true,
      })
      window.binoAnalyticsInitialized = true
    }

    window.gtag('event', 'page_view', {
      page_title: document.title,
      page_location: window.location.origin + pagePath,
      page_path: pagePath,
    })
  }, [enabled, measurementId, pagePath])

  if (!enabled) return null

  return (
    <Script
      src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
      strategy="afterInteractive"
    />
  )
}
