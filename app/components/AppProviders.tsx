'use client'

import type { ReactNode } from 'react'
import { ClientBrandingProvider } from './ClientBrandingContext'
import { PaidAddonsProvider } from './PaidAddonsContext'
import { SidebarNavProvider } from './SidebarNavContext'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ClientBrandingProvider>
      <PaidAddonsProvider>
        <SidebarNavProvider>{children}</SidebarNavProvider>
      </PaidAddonsProvider>
    </ClientBrandingProvider>
  )
}
