'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Button, theme } from '../ui'
import type { ResidentProjectRow } from './AddResidentModal'
import { ProjectResidentIntakePanel } from '../projects/ProjectResidentIntakePanel'
import { resolveBinoClientIdForBrowser } from '@/lib/bamakor-client'

type Props = {
  open: boolean
  onClose: () => void
  isMobile?: boolean
  projects: ResidentProjectRow[]
  defaultProjectId?: string
}

/**
 * Modal to pick a building and share the public resident self-registration (/intake) link.
 */
export function ShareResidentIntakeLinkModal({
  open,
  onClose,
  isMobile,
  projects,
  defaultProjectId = '',
}: Props) {
  const [projectId, setProjectId] = useState(defaultProjectId)
  const [fallbackClientId, setFallbackClientId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setProjectId(defaultProjectId || '')
    let cancelled = false
    void (async () => {
      try {
        const id = await resolveBinoClientIdForBrowser()
        if (!cancelled) setFallbackClientId(id)
      } catch {
        if (!cancelled) setFallbackClientId(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, defaultProjectId])

  const selected = useMemo(
    () => projects.find((p) => p.id === projectId) || null,
    [projects, projectId]
  )

  const clientId = (selected?.client_id || fallbackClientId || '').trim()
  const projectCode = (selected?.project_code || '').trim()
  const canShare = Boolean(selected && clientId && projectCode)

  if (!open) return null

  const panel = (
    <div className={isMobile ? 'app-modal-sheet-root' : undefined} style={styles.modal}>
      <div style={styles.modalHeader}>
        <h2 style={styles.modalTitle}>שליחת קישור רישום דיירים</h2>
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

      <div
        className={isMobile ? 'app-modal-sheet-scroll' : undefined}
        style={isMobile ? styles.scrollMobile : styles.body}
      >
        <p style={styles.intro}>
          שלחו לדיירים קישור קצר לרישום עצמי. אחרי שהם ממלאים — הם מופיעים ברשימת הדיירים.
        </p>

        <div style={styles.formGroup}>
          <label style={styles.formLabel} htmlFor="share-intake-project">
            בניין
          </label>
          <select
            id="share-intake-project"
            className="app-select-input"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
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

        {selected && !projectCode ? (
          <p style={styles.warn}>לפרויקט זה חסר קוד בניין — עדכנו אותו בהגדרות הפרויקט.</p>
        ) : null}
        {selected && projectCode && !clientId ? (
          <p style={styles.warn}>לא ניתן לזהות את הלקוח — רעננו את העמוד ונסו שוב.</p>
        ) : null}

        {canShare && selected ? (
          <ProjectResidentIntakePanel
            projectCode={projectCode}
            clientId={clientId}
            projectName={selected.name}
          />
        ) : null}
      </div>

      <div style={styles.footer}>
        <Button variant="secondary" type="button" onClick={onClose}>
          סגור
        </Button>
      </div>
    </div>
  )

  return (
    <div style={styles.overlay} onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="שליחת קישור רישום דיירים"
        onClick={(e) => e.stopPropagation()}
      >
        {panel}
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(15, 23, 42, 0.45)',
    zIndex: 1200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modal: {
    width: 'min(560px, 100%)',
    maxHeight: '90vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    background: theme.colors.surface,
    borderRadius: theme.radius.lg,
    border: `1px solid ${theme.colors.border}`,
    boxShadow: '0 20px 50px rgba(15, 23, 42, 0.18)',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '16px 18px',
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  modalTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  modalClose: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    color: theme.colors.textSecondary,
    padding: 4,
    display: 'inline-flex',
  },
  body: {
    padding: '16px 18px',
    overflowY: 'auto',
    display: 'grid',
    gap: 14,
  },
  scrollMobile: {
    padding: '16px 18px',
    overflowY: 'auto',
    display: 'grid',
    gap: 14,
    flex: 1,
  },
  intro: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.55,
    color: theme.colors.textSecondary,
  },
  formGroup: {
    display: 'grid',
    gap: 6,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: theme.colors.textPrimary,
  },
  formSelect: {
    width: '100%',
    boxSizing: 'border-box',
    background: theme.colors.surfaceElevated,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.md,
    padding: '10px 14px',
    fontSize: 16,
    color: theme.colors.textPrimary,
  },
  warn: {
    margin: 0,
    fontSize: 13,
    color: theme.colors.warning,
    fontWeight: 600,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '12px 18px 16px',
    borderTop: `1px solid ${theme.colors.border}`,
  },
}
