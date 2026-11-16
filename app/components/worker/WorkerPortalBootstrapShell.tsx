'use client'

import type { CSSProperties, ReactNode } from 'react'
import { theme } from '../ui'
import { WorkerPortalToolbar, type WorkerPortalTab } from './WorkerPortalToolbar'
import { WorkerTicketsScreen } from './WorkerTicketsScreen'

type WorkerPortalBootstrapShellProps = {
  darkMode: boolean
  colors: typeof theme.colors
  logoUrl?: string | null
  /** Cached tenant / worker greeting fragment when known. */
  greetingName?: string
  toolbarRefreshing?: boolean
  ticketsLoading?: boolean
  scrollChildren?: ReactNode
}

const standaloneShell: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100dvh',
  maxHeight: '100dvh',
  overflow: 'hidden',
  paddingTop: 'env(safe-area-inset-top, 0px)',
  boxSizing: 'border-box',
}

const scrollAreaGlass: CSSProperties = {
  position: 'relative',
  zIndex: 1,
  padding: '10px 12px calc(78px + env(safe-area-inset-bottom, 0px) + 18px)',
}

/**
 * Stable worker portal chrome while bootstrap / Suspense resolves — avoids full-viewport logo loader CLS.
 */
export function WorkerPortalBootstrapShell({
  darkMode,
  colors,
  logoUrl,
  greetingName = 'עובד',
  toolbarRefreshing = true,
  ticketsLoading = true,
  scrollChildren,
}: WorkerPortalBootstrapShellProps) {
  const noopTab = (_tab: WorkerPortalTab) => {}

  const initial = greetingName.trim().charAt(0) || 'ע'

  return (
    <div
      className="worker-shell"
      data-worker-theme={darkMode ? 'dark' : 'light'}
      style={{ ...standaloneShell, background: 'transparent' }}
      dir="rtl"
    >
      <div className="worker-ambient-wash" aria-hidden />
      <header className="worker-portal-header">
        <div className="worker-portal-identity">
          <span className="worker-portal-avatar" aria-hidden="true">
            {initial}
          </span>
          <div className="worker-portal-copy">
            <p className="worker-portal-eyebrow">האזור האישי שלך</p>
            <h1 className="worker-portal-title">שלום, {greetingName}</h1>
          </div>
        </div>
      </header>

      <WorkerPortalToolbar
        colors={colors}
        portalTab="TICKETS"
        refreshing={toolbarRefreshing}
        usingCache={false}
        darkMode={darkMode}
        onPortalTabChange={noopTab}
        onRefresh={() => {}}
        onToggleDark={() => {}}
      />

      <div className="worker-shell-scroll" style={scrollAreaGlass}>
        {scrollChildren ?? (
          <WorkerTicketsScreen
            tickets={[]}
            loading={ticketsLoading}
            logoUrl={logoUrl}
            colors={colors}
            renderTicket={() => null}
          />
        )}
      </div>
    </div>
  )
}