'use client'

import { Suspense, useState, type CSSProperties } from 'react'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { AddonFeaturePageShell } from '@/app/components/addons/AddonFeaturePageShell'
import { AddonProjectPicker } from '@/app/components/addons/AddonProjectPicker'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { Button, theme, LoadingSpinner } from '../components/ui'

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
    <div style={styles.panel}>
      <label htmlFor="campaign-name" style={styles.label}>שם קמפיין</label>
      <input id="campaign-name" value={name} onChange={(e) => setName(e.target.value)} style={styles.input} />

      <label htmlFor="campaign-body" style={styles.label}>טקסט ההודעה (ללא אימוג&apos;י)</label>
      <textarea
        id="campaign-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        style={styles.textarea}
        maxLength={900}
      />

      <div style={styles.actions}>
        <Button onClick={() => void dryRun()} disabled={loading || sending}>
          {loading ? 'בודק…' : 'תצוגה מקדימה'}
        </Button>
        <Button onClick={() => void send()} disabled={sending || !body.trim()}>
          {sending ? 'שולח…' : 'שלח לדיירים'}
        </Button>
      </div>

      {preview && (
        <p style={styles.preview}>
          נמענים: {preview.recipients_total} · ללא טלפון: {preview.skipped_no_phone} · אורך: {preview.message_length}
        </p>
      )}
    </div>
  )
}

function WaBroadcastPanel({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [templateName, setTemplateName] = useState('')
  const [bodyParam, setBodyParam] = useState('')
  const [preview, setPreview] = useState<{ recipients_total?: number; skipped_no_phone?: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)

  async function dryRun() {
    if (!templateName.trim()) {
      toast.error('נא להזין שם תבנית Meta')
      return
    }
    setLoading(true)
    try {
      const res = await fetchWithTimeout('/api/whatsapp/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          template_name: templateName.trim(),
          body_param: bodyParam.trim() || undefined,
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
    if (!window.confirm(`לשלוח תבנית WhatsApp לדיירי "${projectName}"?`)) return
    setSending(true)
    try {
      const res = await fetchWithTimeout('/api/whatsapp/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          template_name: templateName.trim(),
          body_param: bodyParam.trim() || undefined,
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
    <div style={styles.panel}>
      <h4 style={styles.sectionTitle}>תפוצת WhatsApp (תבנית Meta)</h4>
      <p style={styles.sectionHint}>דורש תוסף תיבת WhatsApp ותבנית marketing/utility מאושרת ב-Meta.</p>
      <label htmlFor="wa-template" style={styles.label}>שם תבנית</label>
      <input
        id="wa-template"
        value={templateName}
        onChange={(e) => setTemplateName(e.target.value)}
        style={styles.input}
        dir="ltr"
        placeholder="hello_world"
      />
      <label htmlFor="wa-body-param" style={styles.label}>פרמטר גוף (אופציונלי)</label>
      <input
        id="wa-body-param"
        value={bodyParam}
        onChange={(e) => setBodyParam(e.target.value)}
        style={styles.input}
        maxLength={500}
      />
      <div style={styles.actions}>
        <Button onClick={() => void dryRun()} disabled={loading || sending}>
          {loading ? 'בודק…' : 'תצוגה מקדימה'}
        </Button>
        <Button onClick={() => void send()} disabled={sending || !templateName.trim()}>
          {sending ? 'שולח…' : 'שלח WhatsApp'}
        </Button>
      </div>
      {preview && (
        <p style={styles.preview}>
          נמענים: {preview.recipients_total ?? 0} · ללא טלפון: {preview.skipped_no_phone ?? 0}
        </p>
      )}
    </div>
  )
}

function CampaignsPageInner() {
  return (
    <AddonFeaturePageShell
      addonKey={PAID_ADDON_KEYS.campaigns}
      title="קמפיינים"
      mobileSubtitle="SMS ו-WhatsApp לדיירי בניין"
      desktopSubtitle="SMS חופשי (019) ותפוצת WhatsApp בתבניות Meta"
    >
      <AddonProjectPicker emptyHint="הוסיפו בניין כדי לשלוח קמפיין.">
        {(project) => (
          <>
            <CampaignPanel projectId={project.id} projectName={project.name} />
            <WaBroadcastPanel projectId={project.id} projectName={project.name} />
          </>
        )}
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
  panel: { display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 560 },
  label: { fontSize: 13, fontWeight: 600, color: theme.colors.textPrimary },
  input: { padding: 10, borderRadius: 8, border: `1px solid ${theme.colors.border}` },
  textarea: { padding: 10, borderRadius: 8, border: `1px solid ${theme.colors.border}`, fontFamily: 'inherit' },
  actions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  preview: { fontSize: 13, color: theme.colors.textMuted, margin: '8px 0 0' },
  sectionTitle: { margin: '24px 0 4px', fontSize: 15, fontWeight: 600 },
  sectionHint: { margin: '0 0 12px', fontSize: 12, color: theme.colors.textMuted },
}
