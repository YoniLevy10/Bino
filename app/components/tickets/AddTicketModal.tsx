'use client'

import { type CSSProperties } from 'react'
import { Button, theme } from '../ui'

interface ProjectRow {
  id: string
  name: string
  project_code: string
}

interface AddTicketModalProps {
  open: boolean
  onClose: () => void
  /** Bottom-sheet layout + touch targets on narrow viewports */
  isMobile?: boolean
  projects: ProjectRow[]
  projectCode: string
  description: string
  reporterName: string
  reporterPhone: string
  error: string
  loading: boolean
  onProjectCodeChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  onReporterNameChange: (value: string) => void
  onReporterPhoneChange: (value: string) => void
  onSubmit: (e: React.FormEvent) => void
}

export function AddTicketModal({
  open,
  onClose,
  isMobile,
  projects,
  projectCode,
  description,
  reporterName,
  reporterPhone,
  error,
  loading,
  onProjectCodeChange,
  onDescriptionChange,
  onReporterNameChange,
  onReporterPhoneChange,
  onSubmit,
}: AddTicketModalProps) {
  if (!open) return null

  function sanitizePhoneKeystroke(raw: string) {
    const trimmed = raw.replace(/\s|-/g, '')
    const hasPlus = trimmed.startsWith('+')
    const digits = trimmed.replace(/[^\d]/g, '')
    return hasPlus ? `+${digits}` : digits
  }

  function normalizePhone(raw: string) {
    const s = sanitizePhoneKeystroke(raw)
    if (!s) return ''
    if (s.startsWith('+972')) return s
    if (s.startsWith('972')) return `+${s}`
    if (s.startsWith('05')) return s
    return s
  }

  const modalPanel = (
    <div className={isMobile ? 'app-modal-sheet-root' : undefined} style={styles.modal}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>תקלה חדשה</h2>
          <button
            type="button"
            onClick={onClose}
            className="app-modal-close"
            style={styles.modalClose}
            aria-label="סגירה"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <form
          onSubmit={onSubmit}
          className={isMobile ? 'app-modal-sheet-form' : undefined}
          style={isMobile ? styles.modalFormMobile : styles.modalForm}
        >
          <div
            className={isMobile ? 'app-modal-sheet-scroll' : undefined}
            style={isMobile ? styles.modalScrollBody : undefined}
          >
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>פרויקט</label>
            <select
              className="app-select-input"
              value={projectCode}
              onChange={(e) => onProjectCodeChange(e.target.value)}
              style={styles.formSelect}
            >
              <option value="">בחרו פרויקט</option>
              {projects.map((p) => (
                <option key={p.id} value={p.project_code}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>תיאור</label>
            <textarea
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="תיאור התקלה..."
              style={styles.formTextarea}
              rows={4}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>שם מדווח (אופציונלי)</label>
            <input
              type="text"
              value={reporterName}
              onChange={(e) => onReporterNameChange(e.target.value)}
              placeholder="שם"
              style={styles.formInput}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>טלפון מדווח (אופציונלי)</label>
            <input
              type="tel"
              value={reporterPhone}
              inputMode="tel"
              onChange={(e) => onReporterPhoneChange(sanitizePhoneKeystroke(e.target.value))}
              onBlur={() => onReporterPhoneChange(normalizePhone(reporterPhone))}
              placeholder="מספר טלפון"
              style={styles.formInput}
            />
          </div>

          {error && <div style={styles.formError}>{error}</div>}
          </div>

          <div
            className={isMobile ? 'app-modal-sheet-footer' : undefined}
            style={styles.modalActions}
          >
            <Button variant="secondary" type="button" onClick={onClose}>
              ביטול
            </Button>
            <Button
              variant="primary"
              loading={loading}
              type="submit"
            >
              יצירת תקלה
            </Button>
          </div>
        </form>
    </div>
  )

  if (isMobile) {
    return (
      <div
        className="app-modal-backdrop-mobile"
        style={styles.modalOverlay}
        onClick={onClose}
        role="presentation"
      >
        <div onClick={(e) => e.stopPropagation()} role="presentation" style={{ width: '100%' }}>
          {modalPanel}
        </div>
      </div>
    )
  }

  return (
    <>
      <div style={styles.modalOverlay} onClick={onClose} />
      {modalPanel}
    </>
  )
}

const styles: Record<string, CSSProperties> = {
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.7)',
    zIndex: 400,
  },
  modal: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '90%',
    maxWidth: '480px',
    background: theme.colors.surface,
    borderRadius: theme.radius.xl,
    border: `1px solid ${theme.colors.border}`,
    zIndex: 401,
    maxHeight: '90vh',
    overflow: 'auto',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
    margin: 0,
  },
  modalClose: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '44px',
    height: '44px',
    borderRadius: theme.radius.sm,
    background: 'transparent',
    border: 'none',
    color: theme.colors.textMuted,
    cursor: 'pointer',
  },
  modalForm: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  modalFormMobile: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    padding: 0,
    gap: 0,
  },
  modalScrollBody: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  formLabel: {
    fontSize: '13px',
    fontWeight: 500,
    color: theme.colors.textSecondary,
  },
  formSelect: {
    width: '100%',
    boxSizing: 'border-box',
    background: theme.colors.surfaceElevated,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.md,
    padding: '10px 14px',
    fontSize: '16px',
    color: theme.colors.textPrimary,
    outline: 'none',
    cursor: 'pointer',
  },
  formInput: {
    width: '100%',
    boxSizing: 'border-box',
    background: theme.colors.surfaceElevated,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.md,
    padding: '10px 14px',
    fontSize: '16px',
    color: theme.colors.textPrimary,
    outline: 'none',
  },
  formTextarea: {
    width: '100%',
    boxSizing: 'border-box',
    background: theme.colors.surfaceElevated,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.md,
    padding: '12px 14px',
    fontSize: '16px',
    color: theme.colors.textPrimary,
    outline: 'none',
    resize: 'vertical',
    minHeight: '100px',
    lineHeight: 1.5,
  },
  formError: {
    padding: '10px 12px',
    background: theme.colors.errorMuted,
    color: theme.colors.error,
    borderRadius: theme.radius.md,
    fontSize: '13px',
  },
  modalActions: {
    display: 'flex',
    gap: '10px',
    justifyContent: 'flex-end',
    marginTop: '8px',
  },
}
