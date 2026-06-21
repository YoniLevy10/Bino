'use client'

import { Suspense, useEffect, useState, type CSSProperties } from 'react'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { AddonFeaturePageShell } from '@/app/components/addons/AddonFeaturePageShell'
import { AddonProjectPicker } from '@/app/components/addons/AddonProjectPicker'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { WHATSAPP_COEXISTENCE_NOTE } from '@/lib/wa-broadcast'
import { Button, Card, theme, LoadingSpinner } from '../components/ui'

type WaBroadcastTemplate = {
  id: string
  label: string
  description: string
  params: Array<{ key: string; label: string; placeholder?: string; maxLength?: number }>
  meta_name: string
}

type BroadcastPreview = {
  recipients_total?: number
  skipped_no_phone?: number
  sent?: number
  failed?: number
}

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

function WaBroadcastPanel({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [templates, setTemplates] = useState<WaBroadcastTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [templateId, setTemplateId] = useState('')
  const [bodyParams, setBodyParams] = useState<string[]>([])
  const [ackPolicy, setAckPolicy] = useState(false)
  const [preview, setPreview] = useState<BroadcastPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let cancelled = false
    setTemplatesLoading(true)
    void (async () => {
      try {
        const res = await fetchWithTimeout('/api/whatsapp/broadcast')
        const json = (await res.json()) as { templates?: WaBroadcastTemplate[]; error?: string }
        if (!res.ok) throw new Error(json.error ?? `שגיאה ${res.status}`)
        if (!cancelled) {
          const list = json.templates ?? []
          setTemplates(list)
          if (list.length > 0) {
            setTemplateId(list[0].id)
            setBodyParams(list[0].params.map(() => ''))
          }
        }
      } catch {
        if (!cancelled) setTemplates([])
      } finally {
        if (!cancelled) setTemplatesLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const selectedTemplate = templates.find((t) => t.id === templateId)

  function onTemplateChange(id: string) {
    setTemplateId(id)
    const tpl = templates.find((t) => t.id === id)
    setBodyParams(tpl?.params.map(() => '') ?? [])
    setPreview(null)
  }

  function buildPayload(dryRun: boolean) {
    const payload: Record<string, unknown> = {
      project_id: projectId,
      template_id: templateId,
      dry_run: dryRun,
    }
    if (bodyParams.some((p) => p.trim())) {
      payload.body_params = bodyParams.map((p) => p.trim())
    }
    if (!dryRun) payload.ack_wa_policy = true
    return payload
  }

  async function dryRun() {
    if (!templateId) {
      toast.error('נא לבחור תבנית')
      return
    }
    setLoading(true)
    try {
      const res = await fetchWithTimeout('/api/whatsapp/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(true)),
      })
      const json = (await res.json()) as BroadcastPreview & { error?: string }
      if (!res.ok) throw new Error(json.error ?? `שגיאה ${res.status}`)
      setPreview(json)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'בדיקה נכשלה')
    } finally {
      setLoading(false)
    }
  }

  async function send() {
    if (!templateId) {
      toast.error('נא לבחור תבנית')
      return
    }
    if (!ackPolicy) {
      toast.error('יש לאשר את מדיניות WhatsApp לפני שליחה')
      return
    }
    if (!window.confirm(`לשלוח תבנית WhatsApp לדיירי "${projectName}"?`)) return
    setSending(true)
    try {
      const res = await fetchWithTimeout('/api/whatsapp/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(false)),
      })
      const json = (await res.json()) as BroadcastPreview & { error?: string }
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
    <Card title="תפוצת WhatsApp" subtitle="תבנית Utility מאושרת ב-Meta — דורש תוסף תיבת WhatsApp">
      <p style={styles.policyNote}>
        שליחה רק בתבניות Utility מאושרות. אין לשלוח הודעות שיווקיות ללא הסכמת דיירים.
        {WHATSAPP_COEXISTENCE_NOTE ? ` ${WHATSAPP_COEXISTENCE_NOTE}` : ''}
      </p>

      {templatesLoading ? (
        <LoadingSpinner />
      ) : templates.length === 0 ? (
        <p style={styles.preview}>אין תבניות זמינות — ודאו שתוסף WhatsApp פעיל ותבנית ticket_closed מאושרת.</p>
      ) : (
        <>
          <div style={styles.field}>
            <label htmlFor="wa-template" style={styles.label}>תבנית</label>
            <select
              id="wa-template"
              value={templateId}
              onChange={(e) => onTemplateChange(e.target.value)}
              style={styles.input}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
            {selectedTemplate?.description && (
              <p style={styles.preview}>{selectedTemplate.description}</p>
            )}
          </div>

          {selectedTemplate?.params.map((param, i) => (
            <div key={param.key} style={styles.field}>
              <label htmlFor={`wa-param-${param.key}`} style={styles.label}>{param.label}</label>
              <input
                id={`wa-param-${param.key}`}
                value={bodyParams[i] ?? ''}
                onChange={(e) => {
                  const next = [...bodyParams]
                  next[i] = e.target.value
                  setBodyParams(next)
                }}
                style={styles.input}
                maxLength={param.maxLength ?? 500}
                placeholder={param.placeholder}
              />
            </div>
          ))}

          <label style={styles.checkRow}>
            <input
              type="checkbox"
              checked={ackPolicy}
              onChange={(e) => setAckPolicy(e.target.checked)}
            />
            <span>אני מאשר/ת שליחה לפי מדיניות WhatsApp Business (Utility בלבד, ללא ספאם)</span>
          </label>

          <div style={styles.actions}>
            <Button variant="secondary" onClick={() => void dryRun()} loading={loading} disabled={sending}>
              תצוגה מקדימה
            </Button>
            <Button variant="primary" onClick={() => void send()} loading={sending} disabled={!templateId || !ackPolicy}>
              שלח WhatsApp
            </Button>
          </div>

          {preview && (
            <p style={styles.preview}>
              נמענים: {preview.recipients_total ?? 0} · ללא טלפון: {preview.skipped_no_phone ?? 0}
              {preview.sent != null ? ` · נשלחו: ${preview.sent}` : ''}
              {preview.failed ? ` · נכשלו: ${preview.failed}` : ''}
            </p>
          )}
        </>
      )}
    </Card>
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
      <AddonProjectPicker emptyHint="הוסיפו בניין בדף פרויקטים כדי לשלוח קמפיין.">
        {(project) => (
          <div style={styles.panels}>
            <CampaignPanel projectId={project.id} projectName={project.name} />
            <WaBroadcastPanel projectId={project.id} projectName={project.name} />
          </div>
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
  panels: { display: 'flex', flexDirection: 'column', gap: 20 },
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
  policyNote: { fontSize: 12, color: theme.colors.textMuted, margin: '0 0 16px', lineHeight: 1.5 },
  checkRow: { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, marginBottom: 12, cursor: 'pointer' },
}
