'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
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

const shellCss = `
.ticket-detail-mobile-shell [role="tablist"] {
  position: sticky;
  top: 0;
  z-index: 3;
  margin: 0 0 4px;
  box-shadow: 0 8px 16px -12px rgba(15, 23, 42, 0.18);
}
`

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
      <style>{shellCss}</style>
      <header style={shellStyles.header}>
        <div style={shellStyles.headerMain}>
          <h2 id="ticket-detail-mobile-title" style={shellStyles.title}>
            {title}
          </h2>
          {subtitle ? <p style={shellStyles.subtitle}>{subtitle}</p> : null}
        </div>
        <button type="button" onClick={onClose} style={shellStyles.closeButton} aria-label="סגירה">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
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
      {footer ? (
        <footer className="ticket-detail-mobile-shell__footer" style={shellStyles.footer}>
          {footer}
        </footer>
      ) : null}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexShrink: 0,
    width: '100%',
    boxSizing: 'border-box',
    paddingInline: 16,
    paddingTop: 'calc(10px + env(safe-area-inset-top, 0px))',
    paddingBottom: 12,
    borderBottom: `1px solid ${theme.colors.divider}`,
    background: theme.colors.surface,
  },
  headerMain: {
    minWidth: 0,
    flex: 1,
    paddingInlineEnd: 4,
  },
  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 700,
    color: theme.colors.textPrimary,
    lineHeight: 1.25,
    letterSpacing: '-0.02em',
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: 13,
    fontWeight: 500,
    color: theme.colors.textMuted,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: 1.35,
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    marginInlineStart: -6,
    borderRadius: theme.radius.md,
    background: theme.colors.surfaceInset,
    color: theme.colors.textSecondary,
    border: `1px solid ${theme.colors.borderSubtle}`,
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
    paddingInline: 16,
    paddingTop: 12,
    paddingBottom: 12,
    touchAction: 'manipulation',
  },
  footer: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    paddingInline: 16,
    paddingTop: 12,
    paddingBottom: 'calc(14px + env(safe-area-inset-bottom, 0px))',
    borderTop: `1px solid ${theme.colors.divider}`,
    background: theme.colors.surface,
    boxShadow: '0 -6px 20px rgba(15, 23, 42, 0.06)',
  },
}
