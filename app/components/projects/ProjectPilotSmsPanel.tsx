'use client'

import { useState, type CSSProperties } from 'react'
import { buildPilotAnnouncementSms } from '@/lib/pilot-announcement-message'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { Button, Card, theme } from '../ui'

type Props = {
  projectId: string
  projectName: string
}

type PreviewResult = {
  recipients_total: number
  skipped_no_phone: number
  message_length: number
}

export function ProjectPilotSmsPanel({ projectId, projectName }: Props) {
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [sending, setSending] = useState(false)
  const [showMessage, setShowMessage] = useState(false)

  const message = buildPilotAnnouncementSms()

  async function loadPreview() {
    setLoadingPreview(true)
    try {
      const res = await fetchWithTimeout('/api/projects/pilot-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, dry_run: true }),
      })
      const json = await res.json() as PreviewResult & { error?: string }
      if (!res.ok) throw new Error(json.error ?? `שגיאה ${res.status}`)
      setPreview(json)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'בדיקה נכשלה')
      setPreview(null)
    } finally {
      setLoadingPreview(false)
    }
  }

  async function sendPilotSms() {
    if (
      !window.confirm(
        `לשלוח SMS פיילוט לכל הדיירים עם טלפון בפרויקט "${projectName}"?\n\nההודעה רב-לשונית (ללא אימוג'י).`
      )
    ) {
      return
    }
    setSending(true)
    try {
      const res = await fetchWithTimeout('/api/projects/pilot-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, dry_run: false }),
      })
      const json = await res.json() as PreviewResult & {
        sent?: number
        failed?: number
        error?: string
      }
      if (!res.ok) throw new Error(json.error ?? `שגיאה ${res.status}`)
      toast.success(`נשלחו ${json.sent ?? 0} הודעות${json.failed ? `, ${json.failed} נכשלו` : ''}`)
      setPreview({
        recipients_total: json.recipients_total,
        skipped_no_phone: json.skipped_no_phone,
        message_length: json.message_length,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שליחה נכשלה')
    } finally {
      setSending(false)
    }
  }

  return (
    <Card
      title="הודעת פתיחה לדיירים"
      subtitle="SMS רב-לשוני (עברית, אנגלית, צרפתית) — ללא אימוג'י, דרישת ספק 019"
    >
      <button type="button" onClick={() => setShowMessage((v) => !v)} style={styles.linkBtn}>
        {showMessage ? 'הסתר תצוגת הודעה' : 'הצג תצוגת הודעה'}
      </button>
      {showMessage && <pre style={styles.pre}>{message}</pre>}
      <div style={styles.actions}>
        <Button variant="secondary" onClick={() => void loadPreview()} loading={loadingPreview}>
          בדיקת נמענים
        </Button>
        <Button variant="primary" onClick={() => void sendPilotSms()} loading={sending}>
          שלח SMS לדיירים
        </Button>
      </div>
      {preview && (
        <p style={styles.stats}>
          נמענים: <strong>{preview.recipients_total}</strong>
          {preview.skipped_no_phone > 0 && <> · ללא טלפון: {preview.skipped_no_phone}</>}
          {' · '}אורך הודעה: {preview.message_length} תווים
        </p>
      )}
    </Card>
  )
}

const styles: Record<string, CSSProperties> = {
  linkBtn: {
    background: 'none',
    border: 'none',
    padding: 0,
    color: theme.colors.primary,
    cursor: 'pointer',
    fontSize: 13,
    marginBottom: 12,
    fontWeight: 600,
  },
  pre: {
    margin: '0 0 16px',
    padding: 14,
    fontSize: 12,
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    background: theme.colors.muted,
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    maxHeight: 220,
    overflow: 'auto',
  },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  stats: { margin: '16px 0 0', fontSize: 13, color: theme.colors.textSecondary },
}
