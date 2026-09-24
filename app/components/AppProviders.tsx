'use client'

import type { ReactNode } from 'react'
import { AppQueryProvider } from './AppQueryProvider'
import { ClientBrandingProvider } from './ClientBrandingContext'
import { PaidAddonsProvider } from './PaidAddonsContext'
import { SidebarNavProvider } from './SidebarNavContext'
import { MobileMenuProvider } from './ui'
import { TenantAuthSync } from './TenantAuthSync'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AppQueryProvider>
      <ClientBrandingProvider>
        <TenantAuthSync />
        <PaidAddonsProvider>
          <SidebarNavProvider>
            <MobileMenuProvider>{children}</MobileMenuProvider>
          </SidebarNavProvider>
        </PaidAddonsProvider>
      </ClientBrandingProvider>
    </AppQueryProvider>
  )
}
