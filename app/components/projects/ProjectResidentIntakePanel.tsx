'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import {
  buildResidentIntakeShareMessage,
  buildResidentIntakeUrl,
  buildResidentIntakeWhatsAppShareUrl,
} from '@/lib/resident-intake'
import { toast } from '@/lib/error-handler'
import { Button, theme } from '../ui'

type Props = {
  projectCode: string
  clientId: string
  projectName: string
}

export function ProjectResidentIntakePanel({ projectCode, clientId, projectName }: Props) {
  const [intakeUrl, setIntakeUrl] = useState(() =>
    buildResidentIntakeUrl({
      projectCode,
      clientId,
      baseUrl: process.env.NEXT_PUBLIC_APP_URL,
    })
  )

  useEffect(() => {
    setIntakeUrl(
      buildResidentIntakeUrl({
        projectCode,
        clientId,
        baseUrl: process.env.NEXT_PUBLIC_APP_URL || window.location.origin,
      })
    )
  }, [projectCode, clientId])

  const shareMessage = useMemo(
    () => buildResidentIntakeShareMessage({ projectName, intakeUrl }),
    [projectName, intakeUrl]
  )

  const waShareUrl = useMemo(
    () => buildResidentIntakeWhatsAppShareUrl(shareMessage),
    [shareMessage]
  )

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
