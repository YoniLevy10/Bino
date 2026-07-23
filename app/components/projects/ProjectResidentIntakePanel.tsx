'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  buildResidentIntakeShareTemplate,
  buildResidentIntakeUrl,
  buildResidentIntakeWhatsAppShareUrl,
  intakeShareTemplateStorageKey,
  resolveResidentIntakeShareMessage,
} from '@/lib/resident-intake'
import { toast } from '@/lib/error-handler'
import { Button, theme } from '../ui'

type Props = {
  projectCode: string
  clientId: string
  projectName: string
}

function readStoredTemplate(clientId: string, projectCode: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(intakeShareTemplateStorageKey(clientId, projectCode))
    return raw?.trim() ? raw : null
  } catch {
    return null
  }
}

function writeStoredTemplate(clientId: string, projectCode: string, template: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(intakeShareTemplateStorageKey(clientId, projectCode), template)
  } catch {
    // ignore quota / private mode
  }
}

export function ProjectResidentIntakePanel({ projectCode, clientId, projectName }: Props) {
  const [intakeUrl, setIntakeUrl] = useState(() =>
    buildResidentIntakeUrl({
      projectCode,
      clientId,
      baseUrl: process.env.NEXT_PUBLIC_APP_URL,
    })
  )
  const [template, setTemplate] = useState(() => buildResidentIntakeShareTemplate(projectName))

  useEffect(() => {
    setIntakeUrl(
      buildResidentIntakeUrl({
        projectCode,
        clientId,
        baseUrl: process.env.NEXT_PUBLIC_APP_URL || window.location.origin,
      })
    )
    const stored = readStoredTemplate(clientId, projectCode)
    setTemplate(stored || buildResidentIntakeShareTemplate(projectName))
  }, [projectCode, clientId, projectName])

  const shareMessage = useMemo(
    () =>
      resolveResidentIntakeShareMessage(template, {
        projectName,
        intakeUrl,
      }),
    [template, projectName, intakeUrl]
  )

  const waShareUrl = useMemo(
    () => buildResidentIntakeWhatsAppShareUrl(shareMessage),
    [shareMessage]
  )

  function onTemplateChange(value: string) {
    setTemplate(value)
    writeStoredTemplate(clientId, projectCode, value)
  }

  function resetTemplate() {
    const next = buildResidentIntakeShareTemplate(projectName)
    setTemplate(next)
    writeStoredTemplate(clientId, projectCode, next)
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(label)
    } catch {
      toast.error('ההעתקה נכשלה')
    }
  }

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <h4 style={styles.title}>סקר רישום דיירים</h4>
        <p style={styles.hint}>
          קישור קצר (עד 5 שאלות) לשליחה לקבוצת הוואטסאפ של הבניין — הדיירים ממלאים בעצמם.
        </p>
      </div>

      <div style={styles.linkBox} dir="ltr">
        {intakeUrl}
      </div>

      <label style={styles.label} htmlFor={`intake-share-${projectCode}`}>
        תבנית הודעה לשליחה (ניתן לערוך)
      </label>
      <p style={styles.placeholderHint}>
        אפשר להשתמש ב־{'{project}'} לשם הבניין ו־{'{url}'} לקישור. אם אין קישור בטקסט — נוסיף אותו אוטומטית.
      </p>
      <textarea
        id={`intake-share-${projectCode}`}
        value={template}
        onChange={(e) => onTemplateChange(e.target.value)}
        rows={6}
        style={styles.textarea}
        dir="auto"
        spellCheck
      />
      <div style={styles.metaRow}>
        <button type="button" onClick={resetTemplate} style={styles.linkBtn}>
          איפוס לברירת מחדל
        </button>
      </div>

      <div style={styles.previewBox}>
        <div style={styles.previewLabel}>תצוגה מקדימה</div>
        <pre style={styles.previewText}>{shareMessage}</pre>
      </div>

      <div style={styles.actions}>
        <Button variant="secondary" size="sm" onClick={() => copy(intakeUrl, 'קישור הסקר הועתק')}>
          העתקת קישור
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => copy(shareMessage, 'הודעה לשליחה הועתקה')}
        >
          העתקת הודעה
        </Button>
        <a href={waShareUrl} target="_blank" rel="noreferrer" style={styles.waButton}>
          שליחה בוואטסאפ
        </a>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  panel: {
    marginTop: 16,
    padding: 16,
    borderRadius: theme.radius.lg,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.muted,
    display: 'grid',
    gap: 12,
  },
  header: {
    display: 'grid',
    gap: 6,
  },
  title: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  hint: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.5,
    color: theme.colors.textSecondary,
  },
  linkBox: {
    fontSize: 12,
    wordBreak: 'break-all',
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    background: '#FFFFFF',
    border: `1px solid ${theme.colors.border}`,
    color: theme.colors.textPrimary,
    textAlign: 'left',
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: theme.colors.textPrimary,
  },
  placeholderHint: {
    margin: '-4px 0 0',
    fontSize: 12,
    color: theme.colors.textMuted,
    lineHeight: 1.45,
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    margin: 0,
    padding: 12,
    fontSize: 13,
    lineHeight: 1.55,
    fontFamily: 'inherit',
    whiteSpace: 'pre-wrap',
    background: theme.colors.surface,
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    color: theme.colors.textPrimary,
    resize: 'vertical',
    minHeight: 120,
  },
  metaRow: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    padding: 0,
    color: theme.colors.primary,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
  },
  previewBox: {
    padding: 12,
    borderRadius: theme.radius.md,
    background: '#FFFFFF',
    border: `1px dashed ${theme.colors.border}`,
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: theme.colors.textMuted,
    marginBottom: 8,
  },
  previewText: {
    margin: 0,
    whiteSpace: 'pre-wrap',
    fontFamily: 'inherit',
    fontSize: 13,
    lineHeight: 1.5,
    color: theme.colors.textPrimary,
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  waButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 32,
    padding: '6px 12px',
    borderRadius: theme.radius.md,
    background: '#128C7E',
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 700,
    textDecoration: 'none',
  },
}
