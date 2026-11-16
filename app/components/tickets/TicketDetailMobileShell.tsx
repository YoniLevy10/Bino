'use client'

import { createPortal, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { theme } from '../ui'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { useChatSheetScrollLock, useVisualViewportFrame } from '@/lib/use-visual-viewport-frame'

export type TicketDetailMobileShellProps = {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  children: ReactNode
  /** Sticky thumb zone — save / close ticket actions. */
  footer?: ReactNode
}

/**
 * Full-bleed ticket detail on manager mobile (≤768). Avoids the global Drawer bottom sheet
 * so Sarah gets a true full-screen card per mobile usage priorities.
 */
export function TicketDetailMobileShell({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: TicketDetailMobileShellProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [portalReady, setPortalReady] = useState(false)
  const frame = useVisualViewportFrame(open)

  useFocusTrap(panelRef, open)
  useChatSheetScrollLock(open)

  useEffect(() => {
    setPortalReady(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !portalReady || typeof document === 'undefined') return null

  const panelFrame: CSSProperties = frame
    ? {
        top: frame.top,
        height: frame.height,
        bottom: 'auto',
      }
    : {
        top: 0,
        bottom: 0,
        height: '100dvh',
        maxHeight: '100dvh',
      }

  return createPortal(
    <div
      ref={panelRef}
      className="ticket-detail-mobile-shell"
      style={{ ...shellStyles.panel, ...panelFrame }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ticket-detail-mobile-title"
      data-ticket-detail-mobile="true"
    >
      <header style={shellStyles.header}>
        <div style={shellStyles.headerMain}>
          <h2 id="ticket-detail-mobile-title" style={shellStyles.title}>
            {title}
          </h2>
          {subtitle ? <p style={shellStyles.subtitle}>{subtitle}</p> : null}
        </div>
        <button type="button" onClick={onClose} style={shellStyles.closeButton} aria-label="סגירה">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </header>
      <div style={shellStyles.content}>{children}</div>
      {footer ? <footer style={shellStyles.footer}>{footer}</footer> : null}
    </div>,
    document.body
  )
}

const shellStyles: Record<string, CSSProperties> = {
  panel: {
    position: 'fixed',
    left: 0,
    right: 0,
    zIndex: 302,
    display: 'flex',
    flexDirection: 'column',
    background: theme.colors.surface,
    boxSizing: 'border-box',
    direction: 'rtl',
    textAlign: 'right',
    WebkitOverflowScrolling: 'touch',
    touchAction: 'manipulation',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
    flexShrink: 0,
    padding: '12px 16px',
    paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))',
    borderBottom: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
  },
  headerMain: {
    minWidth: 0,
    flex: 1,
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
    lineHeight: 1.25,
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: '14px',
    color: theme.colors.textMuted,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '48px',
    height: '48px',
    margin: '-4px',
    borderRadius: theme.radius.md,
    background: 'transparent',
    color: theme.colors.textMuted,
    border: 'none',
    cursor: 'pointer',
    flexShrink: 0,
    touchAction: 'manipulation',
  },
  content: {
    flex: 1,
    minHeight: 0,
    overflow: 'auto',
    overscrollBehavior: 'contain',
    WebkitOverflowScrolling: 'touch',
    padding: '16px',
    paddingBottom: '8px',
    touchAction: 'manipulation',
  },
  footer: {
    flexShrink: 0,
    padding: '12px 16px',
    paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
    borderTop: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.06)',
  },
}