/** Public marketing paths allowed to load GA4 (not private/app routes). */
export type MarketingPagePath = '/' | '/en' | '/contact' | '/savings-report'

export function getMarketingGaMeasurementId(): string | undefined {
  return process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID
}

export function isValidGaMeasurementId(id: string | undefined | null): id is string {
  return typeof id === 'string' && /^G-[A-Z0-9]+$/.test(id)
}

export type MarketingLeadMethod =
  | 'whatsapp_demo'
  | 'whatsapp_savings'
  | 'contact_phone'
  | 'contact_email'
  | 'contact_nav'

/**
 * Fire a GA4 event on public marketing pages only.
 * No-ops when Measurement ID is missing or gtag is not ready.
 */
export function trackMarketingEvent(
  eventName: string,
  params?: Record<string, string | number | boolean | undefined>
): void {
  if (typeof window === 'undefined') return
  const measurementId = getMarketingGaMeasurementId()
  if (!isValidGaMeasurementId(measurementId)) return
  if (typeof window.gtag !== 'function') return

  window.gtag('event', eventName, {
    send_to: measurementId,
    ...params,
  })
}

/** Primary conversion: demo / contact intent from the public site. */
export function trackMarketingLead(
  method: MarketingLeadMethod,
  extras?: Record<string, string | number | boolean | undefined>
): void {
  trackMarketingEvent('generate_lead', {
    method,
    currency: 'ILS',
    value: 1,
    ...extras,
  })
}
