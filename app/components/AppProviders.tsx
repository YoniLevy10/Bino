'use client'

import type { ReactNode } from 'react'
import { ClientBrandingProvider } from './ClientBrandingContext'
import { PaidAddonsProvider } from './PaidAddonsContext'
import { SidebarNavProvider } from './SidebarNavContext'
import { TenantAuthSync } from './TenantAuthSync'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ClientBrandingProvider>
      <TenantAuthSync />
      <PaidAddonsProvider>
        <SidebarNavProvider>{children}</SidebarNavProvider>
      </PaidAddonsProvider>
    </ClientBrandingProvider>
  )
}
