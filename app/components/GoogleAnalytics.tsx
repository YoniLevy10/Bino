import Script from 'next/script'

/** GA4 measurement id, e.g. G-XXXXXXXXXX — set NEXT_PUBLIC_GA_MEASUREMENT_ID on Vercel. */
export function getGaMeasurementId(): string {
  return (process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '').trim()
}

/**
 * Google Analytics 4 — loads only when a measurement id is configured.
 * Vercel Analytics / Speed Insights remain separate (already in root layout).
 */
export function GoogleAnalytics() {
  const id = getGaMeasurementId()
  if (!id || process.env.NODE_ENV !== 'production') return null

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
      <Script id="bino-ga4" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}',{anonymize_ip:true});`}
      </Script>
    </>
  )
}
