'use client'

import { Suspense, useState, type CSSProperties } from 'react'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { AddonFeaturePageShell } from '@/app/components/addons/AddonFeaturePageShell'
import { AddonProjectPicker } from '@/app/components/addons/AddonProjectPicker'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { Button, Card, theme, LoadingSpinner } from '../components/ui'

function CampaignPanel({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [name, setName] = useState('הודעה לדיירים')
  const [body, setBody] = useState('')
  const [preview, setPreview] = useState<{ recipients_total: number; skipped_no_phone: number; message_length: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)

  async function dryRun() {
    if (!body.trim()) {
      toast.error('נא להזין טקסט הודעה')
      return
    }
    setLoading(true)
    try {
      const res = await fetchWithTimeout('/api/sms/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          campaign_name: name,
          message_body: body,
          dry_run: true,
        }),
      })
      const json = await res.json() as typeof preview & { error?: string }
      if (!res.ok) throw new Error(json.error ?? `שגיאה ${res.status}`)
      setPreview(json)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'בדיקה נכשלה')
    } finally {
      setLoading(false)
    }
  }

  async function send() {
    if (!window.confirm(`לשלוח SMS לדיירי "${projectName}"?\n\nללא אימוג'י — 019SMS.`)) return
    setSending(true)
    try {
      const res = await fetchWithTimeout('/api/sms/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          campaign_name: name,
          message_body: body,
          dry_run: false,
        }),
      })
      const json = await res.json() as { sent?: number; failed?: number; error?: string } & typeof preview
      if (!res.ok) throw new Error(json.error ?? `שגיאה ${res.status}`)
      toast.success(`נשלחו ${json.sent ?? 0} הודעות${json.failed ? `, ${json.failed} נכשלו` : ''}`)
      setPreview(json)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שליחה נכשלה')
    } finally {
      setSending(false)
    }
  }

  return (
    <Card title="קמפיין SMS" subtitle="הודעה חופשית לכל דיירי הבניין (019SMS — ללא אימוג'י)">
      <div style={styles.field}>
        <label htmlFor="campaign-name" style={styles.label}>שם קמפיין</label>
        <input id="campaign-name" value={name} onChange={(e) => setName(e.target.value)} style={styles.input} />
      </div>
      <div style={styles.field}>
        <label htmlFor="campaign-body" style={styles.label}>טקסט ההודעה</label>
        <textarea
          id="campaign-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          style={styles.textarea}
          maxLength={900}
          placeholder="כתבו כאן את ההודעה לדיירים…"
        />
      </div>
      <div style={styles.actions}>
        <Button variant="secondary" onClick={() => void dryRun()} loading={loading} disabled={sending}>
          תצוגה מקדימה
        </Button>
        <Button variant="primary" onClick={() => void send()} loading={sending} disabled={!body.trim()}>
          שלח לדיירים
        </Button>
      </div>
      {preview && (
        <p style={styles.preview}>
          נמענים: {preview.recipients_total} · ללא טלפון: {preview.skipped_no_phone} · אורך: {preview.message_length}
        </p>
      )}
    </Card>
  )
}

function CampaignsPageInner() {
  return (
    <AddonFeaturePageShell
      addonKey={PAID_ADDON_KEYS.campaigns}
      title="קמפיינים"
      mobileSubtitle="SMS לדיירי בניין"
      desktopSubtitle="שליחת הודעת SMS חופשית לכל דיירי הבניין"
    >
      <AddonProjectPicker emptyHint="הוסיפו בניין בדף פרויקטים כדי לשלוח קמפיין.">
        {(project) => <CampaignPanel projectId={project.id} projectName={project.name} />}
      </AddonProjectPicker>
    </AddonFeaturePageShell>
  )
}

export default function CampaignsPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <LoadingSpinner />
        </div>
      }
    >
      <CampaignsPageInner />
    </Suspense>
  )
}

const styles: Record<string, CSSProperties> = {
  field: { marginBottom: 14 },
  label: { display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: theme.colors.textPrimary },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    fontSize: 15,
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    fontFamily: 'inherit',
    fontSize: 15,
    boxSizing: 'border-box',
    resize: 'vertical',
  },
  actions: { display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 },
  preview: { fontSize: 13, color: theme.colors.textMuted, margin: '12px 0 0' },
}
