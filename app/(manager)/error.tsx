'use client'

import { useEffect } from 'react'
import { RouteErrorFallback } from '@/app/components/RouteErrorFallback'

export default function ManagerError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[manager/error]', error.digest || error.message)
  }, [error])

  return <RouteErrorFallback onRetry={reset} linkAsAnchor />
}
