'use client'

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { getIsMobileViewport } from '@/lib/shared/mobile-viewport'
import type { PaidAddonKey } from '@/lib/addons/paid-addons'
import { PaidAddonGate } from '@/app/components/PaidAddonGate'
import { AppShell, MobileHeader, useMobileMenu, PageHeader } from '../ui'

type Props = {
  /** Omit for core features (e.g. כספים / דוחות) — no PaidAddonGate. */
  addonKey?: PaidAddonKey
  title: string
  mobileSubtitle: string
  desktopSubtitle?: string
  children: ReactNode
  headerActions?: ReactNode
  contentMaxWidth?: number
  narrow?: boolean
  /** Edge-to-edge chat layout. The page owns its own header. */
  immersive?: boolean
  /** When false, skip AppShell (parent manager layout already provides it). Default false under (manager). */
  wrapAppShell?: boolean
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
  immersive = false,
  wrapAppShell = false,
}: Props) {
  const [isMobile, setIsMobile] = useState(false)
  const { openMenu } = useMobileMenu()
  const maxWidth = contentMaxWidth ?? (narrow ? 720 : 1400)

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const inner = (
    <>
      {isMobile && !immersive && (
        <MobileHeader
          title={title}
          subtitle={mobileSubtitle}
          onMenuClick={openMenu}
        />
      )}

      <div
        style={{
          ...styles.content,
          maxWidth: immersive ? '100%' : maxWidth,
          ...(isMobile ? styles.contentMobile : {}),
          ...(immersive ? (isMobile ? styles.contentImmersiveMobile : styles.contentImmersive) : {}),
        }}
      >
        {!isMobile && !immersive && (
          <PageHeader
            title={title}
            subtitle={desktopSubtitle ?? mobileSubtitle}
            actions={headerActions}
          />
        )}
        <div style={{ ...styles.body, ...(immersive ? styles.bodyImmersive : {}) }}>{children}</div>
      </div>
    </>
  )

  const body = addonKey ? <PaidAddonGate addonKey={addonKey}>{inner}</PaidAddonGate> : inner

  if (!wrapAppShell) return body
  return <AppShell isMobile={isMobile}>{body}</AppShell>
}

const styles: Record<string, CSSProperties> = {
  content: {
    padding: '32px 40px',
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box',
  },
  contentMobile: {
    padding: '16px 16px calc(24px + env(safe-area-inset-bottom, 0px))',
    maxWidth: '100%',
    overflowX: 'hidden',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  contentImmersive: {
    padding: '12px 16px 16px',
  },
  contentImmersiveMobile: {
    padding: 0,
    maxWidth: '100%',
    flex: '1 1 0%',
    minHeight: 0,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  bodyImmersive: {
    gap: 0,
    flex: '1 1 0%',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'clip',
  },
}
