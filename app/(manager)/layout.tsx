'use client'

import { useEffect, type ReactNode } from 'react'
import { AppShell } from '@/app/components/ui'
import { useIsMobile } from '@/lib/use-is-mobile'

/**
 * Persistent manager chrome — AppShell (sidebar / bottom nav / splash) stays mounted
 * across client navigations between manager routes.
 */
export default function ManagerLayout({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile()

  useEffect(() => {
    document.documentElement.dataset.kiss = '1'
    return () => {
      delete document.documentElement.dataset.kiss
    }
  }, [])

  return <AppShell isMobile={isMobile} calmSurface>{children}</AppShell>
}
