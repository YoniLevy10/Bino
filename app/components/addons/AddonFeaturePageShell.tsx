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
  desktopSubtitle?: string
  children: ReactNode
  headerActions?: ReactNode
  contentMaxWidth?: number
  narrow?: boolean
}

export function AddonFeaturePageShell({
  addonKey,
  title,
  mobileSubtitle,
  desktopSubtitle,
  children,
  headerActions,
  contentMaxWidth,
  narrow = false,
}: Props) {
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const maxWidth = contentMaxWidth ?? (narrow ? 720 : 1400)

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
            maxWidth,
            ...(isMobile ? styles.contentMobile : {}),
          }}
        >
          {!isMobile && (
            <PageHeader
              title={title}
              subtitle={desktopSubtitle ?? mobileSubtitle}
              actions={headerActions}
            />
          )}
          <div style={styles.body}>{children}</div>
        </div>
      </PaidAddonGate>
    </AppShell>
  )
}

const styles: Record<string, CSSProperties> = {
  content: {
    padding: '32px 40px',
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box',
  },
  contentMobile: {
    padding: '16px 16px 32px',
    maxWidth: '100%',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
}
