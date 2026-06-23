'use client'

import type { CSSProperties } from 'react'
import { Button, theme } from '../ui'

type CloseTicketConfirmSheetProps = {
  open: boolean
  ticketNumber: number
  loading?: boolean
  isMobile?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function CloseTicketConfirmSheet({
  open,
  ticketNumber,
  loading,
  isMobile,
  onConfirm,
  onCancel,
}: CloseTicketConfirmSheetProps) {
  if (!open) return null

  const mobile = !!isMobile

  return (
    <>
      <div style={styles.overlay} onClick={loading ? undefined : onCancel} aria-hidden />
      <div
        style={{
          ...styles.panel,
          ...(mobile ? styles.panelMobile : styles.panelDesktop),
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="close-ticket-confirm-title"
      >
        <h2 id="close-ticket-confirm-title" style={styles.title}>
          לסגור תקלה #{ticketNumber}?
        </h2>
        <p style={styles.body}>
          התקלה תוסר מרשימת התקלות הפעילות ותירשם בהיסטוריית הפרויקט. הדייר והמנהל/ת עשויים לקבל הודעה.
        </p>
        <div style={styles.actions}>
          <Button variant="secondary" size="md" onClick={onCancel} disabled={loading} style={{ flex: 1 }}>
            ביטול
          </Button>
          <Button variant="danger" size="md" onClick={onConfirm} loading={loading} style={{ flex: 1 }}>
            סגור תקלה
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
    width: 'min(400px, calc(100vw - 32px))',
    borderRadius: theme.radius.lg,
  },
  title: {
    margin: '0 0 12px',
    fontSize: '18px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  body: {
    margin: '0 0 20px',
    fontSize: '14px',
    lineHeight: 1.5,
    color: theme.colors.textSecondary,
  },
  actions: {
    display: 'flex',
    gap: '12px',
  },
}
