'use client'

import type { ReactNode } from 'react'
import { ClientBrandingProvider } from './ClientBrandingContext'
import { SidebarNavProvider } from './SidebarNavContext'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ClientBrandingProvider>
      <SidebarNavProvider>{children}</SidebarNavProvider>
    </ClientBrandingProvider>
  )
}
