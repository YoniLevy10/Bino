'use client'

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import type { PaidAddonKey } from '@/lib/paid-addons'
import { PaidAddonGate } from '@/app/components/PaidAddonGate'
import { AppShell, MobileHeader, MobileMenu, PageHeader } from '../ui'

type Props = {
  addonKey: PaidAddonKey
  title: string
  mobileSubtitle: string
  desktopSubtitle: string
  children: ReactNode
  contentMaxWidth?: number
}

export function AddonFeaturePageShell({
  addonKey,
  title,
  mobileSubtitle,
  desktopSubtitle,
  children,
  contentMaxWidth = 720,
}: Props) {
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return (
    <AppShell isMobile={isMobile}>
      <PaidAddonGate addonKey={addonKey}>
        {isMobile && (
          <MobileHeader
            title={title}
            subtitle={mobileSubtitle}
            onMenuClick={() => setMenuOpen(true)}
          />
        )}
        <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

        <div
          style={{
            ...styles.content,
            maxWidth: contentMaxWidth,
            ...(isMobile ? styles.contentMobile : {}),
          }}
        >
          {!isMobile && <PageHeader title={title} subtitle={desktopSubtitle} />}
          {children}
        </div>
      </PaidAddonGate>
    </AppShell>
  )
}

const styles: Record<string, CSSProperties> = {
  content: {
    padding: '32px 40px',
    margin: '0 auto',
  },
  contentMobile: {
    padding: '16px 16px 32px',
    maxWidth: '100%',
    boxSizing: 'border-box',
  },
}
