'use client'

import { Suspense, useEffect, useState, type CSSProperties } from 'react'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { AddonFeaturePageShell } from '@/app/components/addons/AddonFeaturePageShell'
import { AddonProjectPicker } from '@/app/components/addons/AddonProjectPicker'
import { usePaidAddons } from '@/app/components/PaidAddonsContext'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { buildInboxTemplatePreview } from '@/lib/whatsapp-inbox-meta-templates'
import { WA_BROADCAST_POLICY_NOTE } from '@/lib/wa-broadcast-eligibility'
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
    <Card title="קמפיין SMS" subtitle="הודעה חופשית לדיירי הבניין (019SMS — ללא אימוג'י)">
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

type WaBroadcastPreview = {
  recipients_total?: number
  residents_with_phone?: number
  skipped_no_phone?: number
  skipped_never_whatsapp?: number
  template_name?: string
}

type WaBroadcastTemplateOption = {
  id: string
  label: string
  description: string
  meta_name: string
  params: { key: string; label: string; placeholder: string; maxLength: number }[]
}

function WaBroadcastPanel({ projectId, projectName }: { projectId: string; projectName: string }) {
  const [templates, setTemplates] = useState<WaBroadcastTemplateOption[]>([])
  const [templateId, setTemplateId] = useState('')
  const [templateParams, setTemplateParams] = useState<string[]>([])
  const [ackPolicy, setAckPolicy] = useState(false)
  const [preview, setPreview] = useState<WaBroadcastPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)

  const activeTemplate = templates.find((t) => t.id === templateId) ?? null

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchWithTimeout('/api/whatsapp/broadcast')
        const json = (await res.json()) as { templates?: WaBroadcastTemplateOption[] }
        if (res.ok && json.templates?.length) {
          setTemplates(json.templates)
          setTemplateId(json.templates[0].id)
          setTemplateParams(json.templates[0].params.map(() => ''))
        } else if (!res.ok) {
          const errJson = json as { error?: string }
          throw new Error(errJson.error ?? `שגיאה ${res.status}`)
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'טעינת תבניות נכשלה')
      }
    })()
  }, [])

  function onTemplateChange(id: string) {
    setTemplateId(id)
    const tpl = templates.find((t) => t.id === id)
    setTemplateParams(tpl?.params.map(() => '') ?? [])
    setPreview(null)
  }

  async function dryRun() {
    if (!templateId) {
      toast.error('בחרו תבנית')
      return
    }
    if (activeTemplate && templateParams.some((p, i) => activeTemplate.params[i] && !p.trim())) {
      toast.error('מלאו את כל שדות התבנית')
      return
    }
    setLoading(true)
    try {
      const res = await fetchWithTimeout('/api/whatsapp/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          template_id: templateId,
          body_params: templateParams,
          dry_run: true,
        }),
      })
      const json = (await res.json()) as WaBroadcastPreview & { error?: string }
      if (!res.ok) throw new Error(json.error ?? `שגיאה ${res.status}`)
      setPreview(json)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'בדיקה נכשלה')
    } finally {
      setLoading(false)
    }
  }

  async function send() {
    if (!ackPolicy) {
      toast.error('סמנו שקראתם והבנתם את מדיניות WhatsApp')
      return
    }
    if (!templateId) {
      toast.error('בחרו תבנית')
      return
    }
    if (!preview) {
      toast.error('הריצו תצוגה מקדימה לפני שליחה')
      return
    }
    const eligible = preview.recipients_total ?? 0
    if (eligible === 0) {
      toast.error('אין נמענים זכאים — השתמשו ב-SMS לפנייה ראשונה')
      return
    }
    const skippedWa = preview.skipped_never_whatsapp ?? 0
    const msg =
      `לשלוח תבנית Utility ל-${eligible} דיירים ב"${projectName}"?\n\n` +
      (skippedWa > 0 ? `${skippedWa} דיירים ברשימה לא יקבלו — מעולם לא כתבו ב-WhatsApp.\n\n` : '') +
      'לא ניתן לשלוח Marketing ללא opt-in.'
    if (!window.confirm(msg)) return
    setSending(true)
    try {
      const res = await fetchWithTimeout('/api/whatsapp/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          template_id: templateId,
          body_params: templateParams,
          dry_run: false,
          ack_wa_policy: true,
        }),
      })
      const json = (await res.json()) as { sent?: number; failed?: number; error?: string } & WaBroadcastPreview
      if (!res.ok) throw new Error(json.error ?? `שגיאה ${res.status}`)
      toast.success(`נשלחו ${json.sent ?? 0} הודעות${json.failed ? `, ${json.failed} נכשלו` : ''}`)
      setPreview(json)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שליחה נכשלה')
    } finally {
      setSending(false)
    }
  }

  const templatePreview =
    activeTemplate && templateParams.length > 0
      ? buildInboxTemplatePreview(
          {
            id: activeTemplate.id,
            label: activeTemplate.label,
            description: activeTemplate.description,
            language: 'he',
            resolveMetaName: () => activeTemplate.meta_name,
            preview: '',
            params: activeTemplate.params,
          },
          templateParams
        )
      : ''

  return (
    <Card title="תפוצת WhatsApp" subtitle="תבניות Utility בלבד — רק לדיירים שכבר יצרו קשר">
      <div style={styles.policyBox}>
        <strong style={styles.policyTitle}>חשוב — WhatsApp ≠ SMS</strong>
        <p style={styles.policyText}>{WA_BROADCAST_POLICY_NOTE}</p>
      </div>
      <div style={styles.field}>
        <label htmlFor="wa-broadcast-template" style={styles.label}>תבנית Utility</label>
        <select
          id="wa-broadcast-template"
          value={templateId}
          onChange={(e) => onTemplateChange(e.target.value)}
          style={styles.input}
        >
          {templates.length === 0 ? (
            <option value="">טוען תבניות…</option>
          ) : (
            templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} ({t.meta_name})
              </option>
            ))
          )}
        </select>
        {activeTemplate?.description ? (
          <p style={styles.hint}>{activeTemplate.description}</p>
        ) : null}
      </div>
      {activeTemplate?.params.map((p, i) => (
        <div key={p.key} style={styles.field}>
          <label htmlFor={`wa-b-param-${p.key}`} style={styles.label}>{p.label}</label>
          <input
            id={`wa-b-param-${p.key}`}
            value={templateParams[i] ?? ''}
            maxLength={p.maxLength}
            placeholder={p.placeholder}
            onChange={(e) => {
              const next = [...templateParams]
              next[i] = e.target.value
              setTemplateParams(next)
            }}
            style={styles.input}
          />
        </div>
      ))}
      {templatePreview ? (
        <div style={styles.previewBox}>
          <div style={styles.previewBoxTitle}>תצוגה מקדימה</div>
          <div style={styles.previewBoxText}>{templatePreview}</div>
        </div>
      ) : null}
      <label style={styles.checkLabel}>
        <input
          type="checkbox"
          checked={ackPolicy}
          onChange={(e) => setAckPolicy(e.target.checked)}
          style={styles.checkbox}
        />
        הבנתי: נשלח רק לדיירים שכבר יצרו קשר ב-WhatsApp. Marketing ללא opt-in אסור.
      </label>
      <div style={styles.actions}>
        <Button variant="secondary" onClick={() => void dryRun()} loading={loading} disabled={sending}>
          תצוגה מקדימה
        </Button>
        <Button
          variant="primary"
          onClick={() => void send()}
          loading={sending}
          disabled={
            !templateId ||
            !ackPolicy ||
            !preview ||
            (preview.recipients_total ?? 0) === 0
          }
        >
          שלח WhatsApp
        </Button>
      </div>
      {preview && (
        <div style={styles.previewStats}>
          <p style={styles.preview}>
            <strong>יעדו לשליחה:</strong> {preview.recipients_total ?? 0} דיירים
          </p>
          <p style={styles.preview}>
            דיירים עם טלפון בבניין: {preview.residents_with_phone ?? '—'} · ללא טלפון:{' '}
            {preview.skipped_no_phone ?? 0}
          </p>
          {(preview.skipped_never_whatsapp ?? 0) > 0 && (
            <p style={styles.previewWarn}>
              דולגו {preview.skipped_never_whatsapp} — מעולם לא כתבו ב-WhatsApp (Meta / מדיניות)
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

function CampaignsPageInner() {
  const { hasAddon } = usePaidAddons()
  const hasWaInbox = hasAddon(PAID_ADDON_KEYS.whatsapp_inbox)

  return (
    <AddonFeaturePageShell
      addonKey={PAID_ADDON_KEYS.campaigns}
      title="קמפיינים"
      mobileSubtitle="SMS ו-WhatsApp לדיירי בניין"
      desktopSubtitle="SMS חופשי לכל דייר · WhatsApp רק לדיירים שכבר יצרו קשר (תבנית Utility)"
    >
      <AddonProjectPicker emptyHint="הוסיפו בניין בדף פרויקטים כדי לשלוח קמפיין.">
        {(project) => (
          <>
            <CampaignPanel projectId={project.id} projectName={project.name} />
            {hasWaInbox ? (
              <WaBroadcastPanel projectId={project.id} projectName={project.name} />
            ) : (
              <Card title="תפוצת WhatsApp" subtitle="נדרש תוסף תיבת WhatsApp">
                <p style={{ margin: 0, fontSize: 14, color: theme.colors.textSecondary, lineHeight: 1.6 }}>
                  תפוצת WhatsApp (תבנית Utility) זמינה עם תוסף «תיבת WhatsApp». SMS זמין למעלה.
                </p>
              </Card>
            )}
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
  preview: { fontSize: 13, color: theme.colors.textMuted, margin: '4px 0 0' },
  previewWarn: { fontSize: 13, color: theme.colors.warning, margin: '4px 0 0', fontWeight: 600 },
  previewStats: { marginTop: 16 },
  policyBox: {
    marginBottom: 16,
    padding: '12px 14px',
    borderRadius: theme.radius.md,
    background: theme.colors.warningMuted,
    border: `1px solid ${theme.colors.warning}`,
  },
  policyTitle: { display: 'block', fontSize: 13, color: theme.colors.textPrimary, marginBottom: 6 },
  policyText: { margin: 0, fontSize: 12, lineHeight: 1.5, color: theme.colors.textSecondary },
  hint: { margin: '6px 0 0', fontSize: 12, color: theme.colors.textMuted },
  previewBox: {
    marginBottom: 14,
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    background: theme.colors.muted,
    border: `1px solid ${theme.colors.borderSubtle}`,
  },
  previewBoxTitle: { fontSize: 11, fontWeight: 600, color: theme.colors.textMuted, marginBottom: 6 },
  previewBoxText: { fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap' },
  checkLabel: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    fontSize: 12,
    lineHeight: 1.45,
    color: theme.colors.textSecondary,
    marginBottom: 4,
    cursor: 'pointer',
  },
  checkbox: { marginTop: 2, flexShrink: 0 },
}
