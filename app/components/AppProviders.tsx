'use client'

import type { ReactNode } from 'react'
import { ClientBrandingProvider } from './ClientBrandingContext'
import { PaidAddonsProvider } from './PaidAddonsContext'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ClientBrandingProvider>
      <PaidAddonsProvider>{children}</PaidAddonsProvider>
    </ClientBrandingProvider>
  )
}
