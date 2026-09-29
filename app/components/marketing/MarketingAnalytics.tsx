'use client'

import { useEffect } from 'react'
import Script from 'next/script'

const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag?: (...args: unknown[]) => void
    binoAnalyticsInitialized?: boolean
  }
}

type MarketingAnalyticsProps = {
  /** Public marketing path only, e.g. `/` or `/en`. */
  pagePath?: '/' | '/en'
}

/**
 * Measure public marketing pages only.
 * Private app routes and tokenized URLs stay out of GA4 (intentional — from main #167).
 */
export function MarketingAnalytics({ pagePath = '/' }: MarketingAnalyticsProps) {
  useEffect(() => {
    if (!measurementId || !/^G-[A-Z0-9]+$/.test(measurementId)) return

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
  }, [pagePath])

  if (!measurementId || !/^G-[A-Z0-9]+$/.test(measurementId)) return null

  return (
    <Script
      src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
      strategy="afterInteractive"
    />
  )
}
