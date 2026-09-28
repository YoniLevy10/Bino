'use client'

import type { CSSProperties, ReactNode } from 'react'
import { Button, theme, useMobileMenuOptional } from '../ui'

const MOBILE_BOTTOM_NAV_CLEARANCE =
  'calc(var(--mobile-bottom-nav-height, 64px) + env(safe-area-inset-bottom, 0px))'
const WORKER_TABBAR_CLEARANCE =
  'calc(var(--worker-tabbar-height, 78px) + env(safe-area-inset-bottom, 0px))'

export type ActionConfirmSheetProps = {
  open: boolean
  title: string
  body?: ReactNode
  children?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  loading?: boolean
  confirmDisabled?: boolean
  confirmVariant?: 'primary' | 'danger'
  isMobile?: boolean
  /** When true, clear floating worker tab dock instead of manager bottom nav. */
  workerPortal?: boolean
  panelStyle?: CSSProperties
  onConfirm: () => void
  onCancel: () => void
}

/** Shared bottom-sheet / modal confirm shell (manager close, worker close, etc.). */
export function ActionConfirmSheet({
  open,
  title,
  body,
  children,
  confirmLabel,
  cancelLabel = 'ביטול',
  loading,
  confirmDisabled,
  confirmVariant = 'primary',
  isMobile,
  workerPortal,
  panelStyle,
  onConfirm,
  onCancel,
}: ActionConfirmSheetProps) {
  const mobile = !!isMobile
  const mobileMenu = useMobileMenuOptional()
  const bottomNavVisible = mobile && !!mobileMenu?.bottomNavVisible && !workerPortal

  if (!open) return null

  return (
    <>
      <div style={styles.overlay} onClick={loading ? undefined : onCancel} aria-hidden />
      <div
        className="lg-glass"
        style={{
          ...styles.panel,
          ...(mobile ? styles.panelMobile : styles.panelDesktop),
          ...(mobile && bottomNavVisible
            ? {
                bottom: MOBILE_BOTTOM_NAV_CLEARANCE,
                paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
              }
            : {}),
          ...(mobile && workerPortal
            ? {
                bottom: WORKER_TABBAR_CLEARANCE,
                paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
              }
            : {}),
          ...panelStyle,
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-confirm-title"
      >
        <h2 id="action-confirm-title" style={styles.title}>
          {title}
        </h2>
        {body ? <div style={styles.body}>{body}</div> : null}
        {children}
        <div style={styles.actions}>
          <Button variant="secondary" size="md" onClick={onCancel} disabled={loading} style={{ flex: 1 }}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant}
            size="md"
            onClick={onConfirm}
            loading={loading}
            disabled={confirmDisabled}
            style={{ flex: 1 }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </>
  )
}

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: theme.colors.overlay,
    zIndex: 410,
  },
  panel: {
    position: 'fixed',
    zIndex: 411,
    padding: '24px 20px',
    direction: 'rtl',
    textAlign: 'right',
  },
  panelMobile: {
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
  },
  panelDesktop: {
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 'min(440px, calc(100vw - 32px))',
    borderRadius: 20,
  },
  title: {
    margin: '0 0 12px',
    fontSize: '18px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
  },
  body: {
    margin: '0 0 16px',
    fontSize: '14px',
    lineHeight: 1.5,
    opacity: 0.85,
  },
  actions: {
    display: 'flex',
    gap: '12px',
    marginTop: '16px',
  },
}
