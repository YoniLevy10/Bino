'use client'

import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { buildPilotAnnouncementSms, stripEmojiForSms } from '@/lib/pilot-announcement-message'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { supabase } from '@/lib/supabase'
import { Button, Card, theme } from '../ui'

const SMS_SOFT_LIMIT = 900

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
  const [whatsappBotPhone, setWhatsappBotPhone] = useState<string | null>(null)
  const [messageText, setMessageText] = useState(() => buildPilotAnnouncementSms())
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadBotPhoneAndTemplate() {
      setPreview(null)
      let phone: string | null = null
      try {
        const { data: project } = await supabase
          .from('projects')
          .select('client_id')
          .eq('id', projectId)
          .maybeSingle()

        const clientId = (project as { client_id?: string } | null)?.client_id
        if (clientId) {
          const { data: client } = await supabase
            .from('clients')
            .select('whatsapp_business_phone, manager_phone, default_worker_phone')
            .eq('id', clientId)
            .maybeSingle()

          const row = client as {
            whatsapp_business_phone?: string | null
            manager_phone?: string | null
            default_worker_phone?: string | null
          } | null

          phone =
            row?.whatsapp_business_phone?.trim() ||
            row?.manager_phone?.trim() ||
            row?.default_worker_phone?.trim() ||
            null
        }
      } catch {
        phone = null
      }

      if (cancelled) return
      setWhatsappBotPhone(phone)
      setMessageText(buildPilotAnnouncementSms({ whatsappBotPhone: phone }))
    }

    void loadBotPhoneAndTemplate()
    return () => {
      cancelled = true
    }
  }, [projectId])

  const sanitizedLength = useMemo(() => stripEmojiForSms(messageText).length, [messageText])
  const overLimit = sanitizedLength > SMS_SOFT_LIMIT

  function resetMessage() {
    setMessageText(buildPilotAnnouncementSms({ whatsappBotPhone }))
    setPreview(null)
  }

  function payloadBody(dryRun: boolean) {
    return {
      project_id: projectId,
      dry_run: dryRun,
      message: messageText.trim() || undefined,
    }
  }

  async function loadPreview() {
    if (!messageText.trim()) {
      toast.error('יש להזין טקסט להודעה')
      return
    }
    setLoadingPreview(true)
    try {
      const res = await fetchWithTimeout('/api/projects/pilot-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadBody(true)),
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
    if (!messageText.trim()) {
      toast.error('יש להזין טקסט להודעה')
      return
    }
    if (
      !window.confirm(
        `לשלוח SMS לכל הדיירים עם טלפון בפרויקט "${projectName}"?\n\n${overLimit ? `אזהרה: ההודעה ארוכה (${sanitizedLength} תווים) — הספק עלול לקצר.\n\n` : ''}ללא אימוג'י.`
      )
    ) {
      return
    }
    setSending(true)
    try {
      const res = await fetchWithTimeout('/api/projects/pilot-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadBody(false)),
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
      subtitle="ערכו את הטקסט לפני השליחה — כולל מספר הוואטסאפ של הבוט, רב-לשוני, ללא אימוג'י (דרישת 019SMS)"
    >
      {!whatsappBotPhone && (
        <p style={styles.warn}>
          לא נמצא מספר וואטסאפ בהגדרות הלקוח — מומלץ למלא &quot;מספר וואטסאפ לקישורי QR&quot; בהגדרות כדי שהמספר יופיע בהודעה.
        </p>
      )}
      <label style={styles.label} htmlFor={`pilot-sms-${projectId}`}>
        תוכן ההודעה
      </label>
      <textarea
        id={`pilot-sms-${projectId}`}
        value={messageText}
        onChange={(e) => {
          setMessageText(e.target.value)
          setPreview(null)
        }}
        rows={16}
        style={styles.textarea}
        dir="auto"
        spellCheck
      />
      <div style={styles.metaRow}>
        <span style={{ ...styles.charCount, ...(overLimit ? { color: theme.colors.warning } : {}) }}>
          {sanitizedLength} תווים{overLimit ? ` (מומלץ עד ${SMS_SOFT_LIMIT})` : ''}
        </span>
        <button type="button" onClick={resetMessage} style={styles.linkBtn}>
          איפוס לברירת מחדל
        </button>
      </div>
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
          {' · '}אורך הודעה לשליחה: {preview.message_length} תווים
        </p>
      )}
    </Card>
  )
}

const styles: Record<string, CSSProperties> = {
  warn: {
    margin: '0 0 12px',
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    background: theme.colors.warningMuted,
    color: theme.colors.textPrimary,
    fontSize: 13,
    lineHeight: 1.45,
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    margin: '0 0 8px',
    padding: 14,
    fontSize: 13,
    lineHeight: 1.55,
    fontFamily: 'inherit',
    whiteSpace: 'pre-wrap',
    background: theme.colors.surface,
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    color: theme.colors.textPrimary,
    resize: 'vertical',
    minHeight: 240,
  },
  metaRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  charCount: {
    fontSize: 12,
    color: theme.colors.textMuted,
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
  actions: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  stats: { margin: '16px 0 0', fontSize: 13, color: theme.colors.textSecondary },
}
