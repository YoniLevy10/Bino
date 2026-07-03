'use client'

import type { CSSProperties, ReactNode } from 'react'
import { Button, theme } from '../ui'

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
  panelStyle,
  onConfirm,
  onCancel,
}: ActionConfirmSheetProps) {
  if (!open) return null

  const mobile = !!isMobile

  return (
    <>
      <div style={styles.overlay} onClick={loading ? undefined : onCancel} aria-hidden />
      <div
        style={{
          ...styles.panel,
          ...(mobile ? styles.panelMobile : styles.panelDesktop),
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
    zIndex: 300,
  },
  panel: {
    position: 'fixed',
    zIndex: 301,
    background: theme.colors.surface,
    padding: '24px 20px',
    boxShadow: theme.shadows.xl,
    direction: 'rtl',
    textAlign: 'right',
  },
  panelMobile: {
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
  },
  panelDesktop: {
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 'min(440px, calc(100vw - 32px))',
    borderRadius: theme.radius.lg,
  },
  title: {
    margin: '0 0 12px',
    fontSize: '18px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  body: {
    margin: '0 0 16px',
    fontSize: '14px',
    lineHeight: 1.5,
    color: theme.colors.textSecondary,
  },
  actions: {
    display: 'flex',
    gap: '12px',
    marginTop: '16px',
  },
}
