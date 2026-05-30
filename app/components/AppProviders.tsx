'use client'

import type { ReactNode } from 'react'
import { ClientBrandingProvider } from './ClientBrandingContext'

export function AppProviders({ children }: { children: ReactNode }) {
  return <ClientBrandingProvider>{children}</ClientBrandingProvider>
}
