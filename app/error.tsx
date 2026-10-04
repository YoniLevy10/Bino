'use client'

import { useEffect } from 'react'
import { RouteErrorFallback } from '@/app/components/RouteErrorFallback'

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Digest only — never log stack to the UI.
    console.error('[app/error]', error.digest || error.message)
  }, [error])

  return <RouteErrorFallback onRetry={reset} linkAsAnchor />
}
