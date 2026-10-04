'use client'

/**
 * Dev-only forced render error for verifying error.tsx.
 * Enabled only when NEXT_PUBLIC_ALLOW_FORCE_ERROR=1.
 */
import { notFound } from 'next/navigation'

export default function ForceErrorPage() {
  if (process.env.NEXT_PUBLIC_ALLOW_FORCE_ERROR !== '1') {
    notFound()
  }
  throw new Error('forced-render-error-for-boundary-test')
}
