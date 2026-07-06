'use client'

import { type CSSProperties } from 'react'
import { Button, theme } from '../ui'

export type ResidentProjectRow = { id: string; name: string; project_code: string; client_id?: string | null }

type AddResidentModalProps = {
  open: boolean
  onClose: () => void
  isMobile?: boolean
  projects: ResidentProjectRow[]
  projectId: string
  fullName: string
  phone: string
  email: string
  isRenter: boolean
  apartmentNumber: string
  notes: string
  error: string
  loading: boolean
  /** 'edit' — כותרת וכפתור שמירה לעדכון דייר קיים */
  variant?: 'add' | 'edit'
  /** במצב עריכה — מחיקת הדייר (כפתור מסוכן ליד ביטול/שמירה) */
  onDelete?: () => void
  deleteLoading?: boolean
  onProjectIdChange: (value: string) => void
  onFullNameChange: (value: string) => void
  onPhoneChange: (value: string) => void
  onEmailChange: (value: string) => void
  onIsRenterChange: (value: boolean) => void
  onApartmentNumberChange: (value: string) => void
  onNotesChange: (value: string) => void
  onSubmit: (e: React.FormEvent) => void
}

export function AddResidentModal({
  open,
  onClose,
  isMobile,
  projects,
  projectId,
  fullName,
  phone,
  email,
  isRenter,
  apartmentNumber,
  notes,
  error,
  loading,
  variant = 'add',
  onDelete,
  deleteLoading = false,
  onProjectIdChange,
  onFullNameChange,
  onPhoneChange,
  onEmailChange,
  onIsRenterChange,
  onApartmentNumberChange,
  onNotesChange,
  onSubmit,
}: AddResidentModalProps) {
  if (!open) return null

  const isEdit = variant === 'edit'

  function sanitizePhoneKeystroke(raw: string) {
    const trimmed = raw.replace(/\s|-/g, '')
    const hasPlus = trimmed.startsWith('+')
    const digits = trimmed.replace(/[^\d]/g, '')
    return hasPlus ? `+${digits}` : digits
  }

  return (
    <>
      <div style={styles.modalOverlay} onClick={onClose} />
      <div className={isMobile ? 'app-modal-sheet-root' : undefined} style={styles.modal}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>{isEdit ? 'עריכת דייר' : 'הוספת דייר'}</h2>
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
            <label style={styles.formLabel}>בניין</label>
            <select
              className="app-select-input"
              value={projectId}
              onChange={(e) => onProjectIdChange(e.target.value)}
              style={styles.formSelect}
            >
              <option value="">בחרו בניין</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>שם מלא</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => onFullNameChange(e.target.value)}
              placeholder="שם הדייר"
              style={styles.formInput}
              autoFocus
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>טלפון (אופציונלי)</label>
            <input
              type="tel"
              value={phone}
              inputMode="tel"
              onChange={(e) => onPhoneChange(sanitizePhoneKeystroke(e.target.value))}
              placeholder="05… / +972…"
              style={styles.formInput}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>אימייל (אופציונלי)</label>
            <input
              type="email"
              value={email ?? ''}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="example@gmail.com"
              style={styles.formInput}
              dir="ltr"
            />
          </div>

          <label style={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={isRenter ?? false}
              onChange={(e) => onIsRenterChange(e.target.checked)}
            />
            <span style={styles.formLabel}>דירה מושכרת</span>
          </label>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>מספר דירה (אופציונלי)</label>
            <input
              type="text"
              value={apartmentNumber}
              onChange={(e) => onApartmentNumberChange(e.target.value)}
              placeholder="למשל 12"
              style={styles.formInput}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>הערות (אופציונלי)</label>
            <textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="מידע נוסף"
              style={styles.formTextarea}
              rows={3}
            />
          </div>

          {error && <div style={styles.formError}>{error}</div>}
          </div>

          <div
            className={isMobile ? 'app-modal-sheet-footer' : undefined}
            style={styles.modalActions}
          >
            <div style={styles.modalActionsStart}>
              {isEdit && onDelete ? (
                <Button
                  variant="danger"
                  type="button"
                  onClick={onDelete}
                  loading={deleteLoading}
                  disabled={loading}
                >
                  מחק דייר
                </Button>
              ) : null}
            </div>
            <div style={styles.modalActionsEnd}>
              <Button variant="secondary" type="button" onClick={onClose} disabled={deleteLoading}>
                ביטול
              </Button>
              <Button variant="primary" loading={loading} type="submit" disabled={deleteLoading}>
                {isEdit ? 'שמירת שינויים' : 'שמירה'}
              </Button>
            </div>
          </div>
        </form>
      </div>
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
    maxWidth: '520px',
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
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 12px',
    background: theme.colors.surfaceElevated,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.md,
    cursor: 'pointer',
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
    minHeight: '84px',
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
    flexWrap: 'wrap',
    gap: '10px',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '8px',
  },
  modalActionsStart: {
    display: 'flex',
    alignItems: 'center',
    minHeight: '40px',
  },
  modalActionsEnd: {
    display: 'flex',
    gap: '10px',
    marginInlineStart: 'auto',
  },
}
