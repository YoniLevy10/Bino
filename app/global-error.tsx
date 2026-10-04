'use client'

import { useEffect } from 'react'
import { RouteErrorFallback } from '@/app/components/RouteErrorFallback'

/** Root-level crash — must render its own html/body. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[global-error]', error.digest || error.message)
  }, [error])

  return (
    <html lang="he" dir="rtl">
      <body style={{ margin: 0 }}>
        <RouteErrorFallback onRetry={reset} linkAsAnchor />
      </body>
    </html>
  )
}
