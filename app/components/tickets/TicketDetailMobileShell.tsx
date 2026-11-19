'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { theme } from '../ui'
import { useFocusTrap } from '@/lib/hooks/useFocusTrap'
import { useChatSheetScrollLock } from '@/lib/hooks/use-visual-viewport-frame'

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
 * Centered ticket-detail popup on manager mobile (≤768), matching the desktop
 * Drawer `placement="center"` modal — not a full-bleed page.
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

  return createPortal(
    <div
      className="ticket-detail-mobile-shell"
      style={shellStyles.overlay}
      onClick={onClose}
      role="presentation"
      data-ticket-detail-mobile="true"
    >
      <style>{shellCss}</style>
      <div
        ref={panelRef}
        style={shellStyles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-detail-mobile-title"
        onClick={(e) => e.stopPropagation()}
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
      </div>
    </div>,
    document.body
  )
}

const shellStyles: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 320,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px',
    paddingTop: 'max(12px, env(safe-area-inset-top, 0px))',
    paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))',
    boxSizing: 'border-box',
    background: theme.colors.overlay,
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    animation: 'fadeIn 0.2s ease',
    direction: 'rtl',
    textAlign: 'right',
    touchAction: 'manipulation',
  },
  panel: {
    width: 'min(560px, calc(100vw - 24px))',
    height: 'min(720px, calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)))',
    maxHeight: 'calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))',
    display: 'flex',
    flexDirection: 'column',
    background: theme.colors.surfaceElevated,
    borderRadius: theme.radius.xl,
    border: `1px solid ${theme.colors.border}`,
    boxShadow: theme.shadows.xl,
    overflow: 'hidden',
    animation: 'hubModalIn 0.22s ease',
    transformOrigin: 'center center',
    zIndex: 321,
    boxSizing: 'border-box',
    WebkitOverflowScrolling: 'touch',
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
    paddingTop: 14,
    paddingBottom: 12,
    borderBottom: `1px solid ${theme.colors.borderSubtle}`,
    background: `linear-gradient(180deg, ${theme.colors.blueSoft} 0%, ${theme.colors.surface} 72%)`,
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
    background: theme.colors.background,
    touchAction: 'manipulation',
  },
  footer: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    paddingInline: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderTop: `1px solid ${theme.colors.divider}`,
    background: theme.colors.surface,
    boxShadow: '0 -6px 20px rgba(15, 23, 42, 0.06)',
  },
}
