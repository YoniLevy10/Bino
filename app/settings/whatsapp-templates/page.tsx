'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { resolveBamakorClientIdForBrowser } from '@/lib/bamakor-client'
import {
  WHATSAPP_TEMPLATE_KEYS,
  type WhatsAppTemplateKey,
  WHATSAPP_TEMPLATE_LABELS,
  WHATSAPP_TEMPLATE_EDITOR_DEFAULTS,
  WHATSAPP_TEMPLATE_VAR_NAMES,
  WHATSAPP_TEMPLATE_JOURNEY,
  WHATSAPP_TEMPLATE_WHEN_SENT,
  WHATSAPP_ARCHIVED_TEMPLATE_KEYS,
  SMS_TEMPLATE_KEYS,
  type SmsTemplateKey,
  SMS_TEMPLATE_LABELS,
  SMS_TEMPLATE_EDITOR_DEFAULTS,
  SMS_TEMPLATE_VAR_NAMES,
  SMS_TEMPLATE_WHEN_SENT,
} from '@/lib/whatsapp-template-keys'
import { interpolateWhatsAppTemplate, interpolateSmsTemplate } from '@/lib/whatsapp-templates'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { TM } from '@/lib/toast-messages'
import {
  AppShell,
  MobileHeader,
  MobileMenu,
  PageHeader,
  Button,
  LoadingSpinner,
  theme,
} from '../../components/ui'
import { PageListSkeleton } from '../../components/page-skeleton'

const PREVIEW_SAMPLE: Record<(typeof WHATSAPP_TEMPLATE_VAR_NAMES)[number], string> = {
  project_name: 'מגדלי הים התיכון',
  ticket_number: '128',
  description: 'נזילה מהצנרת בחדר האמבטיה',
  reporter_name: 'ישראל ישראלי',
  building_line: '\nבניין: ב׳',
  list: '1. מגדלי הים התיכון\n2. בית הכרמל',
}

const SMS_PREVIEW_SAMPLE: Record<(typeof SMS_TEMPLATE_VAR_NAMES)[number], string> = {
  project_name: 'מגדלי הים התיכון',
  ticket_number: '128',
  description: 'נזילה מהצנרת בחדר האמבטיה',
  reporter_name: 'ישראל ישראלי',
  building_line: 'בניין: ב׳\n',
  dashboard_url: 'https://app.bamakor.com/tickets',
  client_name: 'ועד הבית',
}

const STEP_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#0891b2', '#dc2626']

function insertVarAtCursor(
  el: HTMLTextAreaElement | null,
  value: string,
  token: string,
  onChange: (next: string) => void
) {
  if (!el) { onChange(value + token); return }
  const start = el.selectionStart ?? value.length
  const end = el.selectionEnd ?? value.length
  const next = value.slice(0, start) + token + value.slice(end)
  onChange(next)
  requestAnimationFrame(() => {
    el.focus()
    const pos = start + token.length
    el.setSelectionRange(pos, pos)
  })
}

export default function WhatsappTemplatesPage() {
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [clientId, setClientId] = useState('')
  const [drafts, setDrafts] = useState<Record<WhatsAppTemplateKey, string>>(() => ({
    ...WHATSAPP_TEMPLATE_EDITOR_DEFAULTS,
  }))
  const [smsDrafts, setSmsDrafts] = useState<Record<SmsTemplateKey, string>>(() => ({
    ...SMS_TEMPLATE_EDITOR_DEFAULTS,
  }))
  const [savingKey, setSavingKey] = useState<WhatsAppTemplateKey | null>(null)
  const [smsSavingKey, setSmsSavingKey] = useState<SmsTemplateKey | null>(null)
  const [savingAll, setSavingAll] = useState(false)
  const [syncingFlow, setSyncingFlow] = useState(false)
  const [expandedKeys, setExpandedKeys] = useState<Set<WhatsAppTemplateKey>>(new Set())
  const [smsExpandedKeys, setSmsExpandedKeys] = useState<Set<SmsTemplateKey>>(new Set())
  const textareaRefs = useRef<Partial<Record<WhatsAppTemplateKey, HTMLTextAreaElement | null>>>({})
  const smsTextareaRefs = useRef<Partial<Record<SmsTemplateKey, HTMLTextAreaElement | null>>>({})

  const setRef = useCallback((key: WhatsAppTemplateKey) => (el: HTMLTextAreaElement | null) => {
    textareaRefs.current[key] = el
  }, [])

  const setSmsRef = useCallback((key: SmsTemplateKey) => (el: HTMLTextAreaElement | null) => {
    smsTextareaRefs.current[key] = el
  }, [])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const cid = await resolveBamakorClientIdForBrowser()
        if (cancelled) return
        setClientId(cid)
        const { data, error } = await supabase
          .from('whatsapp_templates')
          .select('template_key, template_text')
          .eq('client_id', cid)

        if (error && !error.message.includes('does not exist') && !error.message.includes('schema cache')) {
          throw error
        }

        const next = { ...WHATSAPP_TEMPLATE_EDITOR_DEFAULTS }
        const smsNext = { ...SMS_TEMPLATE_EDITOR_DEFAULTS }
        for (const row of (data || []) as { template_key: string; template_text: string }[]) {
          const k = row.template_key as WhatsAppTemplateKey
          const sk = row.template_key as SmsTemplateKey
          if (WHATSAPP_TEMPLATE_KEYS.includes(k)) next[k] = row.template_text
          else if ((SMS_TEMPLATE_KEYS as readonly string[]).includes(row.template_key)) smsNext[sk] = row.template_text
        }
        if (!cancelled) { setDrafts(next); setSmsDrafts(smsNext) }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'טעינה נכשלה')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  async function saveKey(key: WhatsAppTemplateKey) {
    if (!clientId) return
    setSavingKey(key)
    try {
      const { error } = await supabase.from('whatsapp_templates').upsert(
        { client_id: clientId, template_key: key, template_text: drafts[key] || '', updated_at: new Date().toISOString() },
        { onConflict: 'client_id,template_key' }
      )
      if (error) throw error
      toast.success(TM.whatsappTemplatesSaved)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : TM.genericSaveError)
    } finally {
      setSavingKey(null)
    }
  }

  async function saveSmsKey(key: SmsTemplateKey) {
    if (!clientId) return
    setSmsSavingKey(key)
    try {
      const { error } = await supabase.from('whatsapp_templates').upsert(
        { client_id: clientId, template_key: key, template_text: smsDrafts[key] || '', updated_at: new Date().toISOString() },
        { onConflict: 'client_id,template_key' }
      )
      if (error) throw error
      toast.success(TM.whatsappTemplatesSaved)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : TM.genericSaveError)
    } finally {
      setSmsSavingKey(null)
    }
  }

  async function saveAll() {
    if (!clientId) return
    setSavingAll(true)
    try {
      const waRows = WHATSAPP_TEMPLATE_KEYS.map((key) => ({
        client_id: clientId, template_key: key, template_text: drafts[key] || '', updated_at: new Date().toISOString(),
      }))
      const smsRows = SMS_TEMPLATE_KEYS.map((key) => ({
        client_id: clientId, template_key: key, template_text: smsDrafts[key] || '', updated_at: new Date().toISOString(),
      }))
      const { error } = await supabase.from('whatsapp_templates').upsert([...waRows, ...smsRows], { onConflict: 'client_id,template_key' })
      if (error) throw error
      toast.success('כל התבניות נשמרו בהצלחה')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : TM.genericSaveError)
    } finally {
      setSavingAll(false)
    }
  }

  async function syncFlowToWebhook() {
    if (!clientId) return
    const ok = window.confirm(
      'לסנכרן את כל תבניות וואטסאפ ו-SMS לטקסטים שבקוד (זרימת ה-webhook)?\n\n' +
        'פעולה זו תדרוס התאמות ידניות בעורך. מומלץ אחרי עדכון מערכת או אם ההודעות בפועל לא תואמות לתצוגה מקדימה.'
    )
    if (!ok) return
    setSyncingFlow(true)
    try {
      const res = await fetchWithTimeout('/api/settings/sync-whatsapp-templates', { method: 'POST' })
      const data = (await res.json().catch(() => ({}))) as { error?: string; synced_count?: number }
      if (!res.ok) throw new Error(data.error || TM.genericSaveError)
      setDrafts({ ...WHATSAPP_TEMPLATE_EDITOR_DEFAULTS })
      setSmsDrafts({ ...SMS_TEMPLATE_EDITOR_DEFAULTS })
      toast.success(`סונכרנו ${data.synced_count ?? ''} תבניות לזרימה הפעילה`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : TM.genericSaveError)
    } finally {
      setSyncingFlow(false)
    }
  }

  const previews = useMemo(() => {
    const m: Record<WhatsAppTemplateKey, string> = { ...drafts }
    for (const k of WHATSAPP_TEMPLATE_KEYS) {
      m[k] = interpolateWhatsAppTemplate(drafts[k] || '', PREVIEW_SAMPLE)
    }
    return m
  }, [drafts])

  const smsPreviews = useMemo(() => {
    const m: Record<SmsTemplateKey, string> = { ...smsDrafts }
    for (const k of SMS_TEMPLATE_KEYS) {
      m[k] = interpolateSmsTemplate(smsDrafts[k] || '', SMS_PREVIEW_SAMPLE)
    }
    return m
  }, [smsDrafts])

  function toggleExpand(key: WhatsAppTemplateKey) {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleSmsExpand(key: SmsTemplateKey) {
    setSmsExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function chip(token: string, key: WhatsAppTemplateKey) {
    return (
      <button
        key={token + key}
        type="button"
        onClick={() =>
          insertVarAtCursor(textareaRefs.current[key] ?? null, drafts[key] || '', token, (next) =>
            setDrafts((d) => ({ ...d, [key]: next }))
          )
        }
        style={styles.chip}
      >
        {token}
      </button>
    )
  }

  return (
    <AppShell isMobile={isMobile}>
      {isMobile && (
        <MobileHeader title="תבניות וואטסאפ" subtitle="הודעות אוטומטיות" onMenuClick={() => setMenuOpen(true)} />
      )}
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div style={styles.content}>
        {!isMobile && (
          <PageHeader
            title="תבניות הודעות וואטסאפ"
            subtitle="כל ההודעות שנשלחות לדיירים — מסודרות לפי רצף השיחה"
            actions={
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button variant="secondary" size="sm" onClick={syncFlowToWebhook} loading={syncingFlow}>
                  סנכרון לזרימה
                </Button>
                <Button variant="primary" size="sm" onClick={saveAll} loading={savingAll}>
                  שמור הכל
                </Button>
                <Link href="/settings" style={styles.backLink}>← חזרה להגדרות</Link>
              </div>
            }
          />
        )}
        {isMobile && (
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <Link href="/settings" style={styles.backLink}>← חזרה להגדרות</Link>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" size="sm" onClick={syncFlowToWebhook} loading={syncingFlow}>סנכרון לזרימה</Button>
              <Button variant="primary" size="sm" onClick={saveAll} loading={savingAll}>שמור הכל</Button>
            </div>
          </div>
        )}

        <div style={styles.syncBanner}>
          <strong>חשוב:</strong> ההודעות בוואטסאפ בפועל נלקחות מ-DB. אם ערכתם בעבר והן לא תואמות לזרימה — לחצו{' '}
          <button type="button" onClick={syncFlowToWebhook} disabled={syncingFlow || loading} style={styles.syncBannerLink}>
            סנכרון לזרימה
          </button>
          . מיקום GPS לא בשימוש — נשלחת <code style={styles.inlineCode}>redirect_to_text</code>.
        </div>

        {loading ? (
          <div style={{ padding: 48, display: 'flex', justifyContent: 'center', flexDirection: 'column', gap: 20 }}>
            <PageListSkeleton rows={6} />
            <div style={{ display: 'flex', justifyContent: 'center' }}><LoadingSpinner size="md" /></div>
          </div>
        ) : (
          <div style={styles.journey}>
            {/* SMS Templates Section */}
            <div style={styles.stepSection}>
              <div style={styles.stepHeader}>
                <div style={{ ...styles.stepBadge, background: '#16a34a' }}>📱</div>
                <div>
                  <div style={styles.stepTitle}>תבניות SMS</div>
                  <div style={styles.stepDesc}>הודעות SMS שנשלחות למנהל/ת ולעובד בפתיחת תקלה חדשה</div>
                </div>
              </div>
              <div style={styles.templateList}>
                {SMS_TEMPLATE_KEYS.map((key) => {
                  const isOpen = smsExpandedKeys.has(key)
                  return (
                    <div key={key} style={styles.templateCard}>
                      <button onClick={() => toggleSmsExpand(key)} style={styles.templateCardHeader}>
                        <div style={{ flex: 1, textAlign: 'right' }}>
                          <div style={styles.templateLabel}>{SMS_TEMPLATE_LABELS[key]}</div>
                          <div style={styles.whenSent}>⚡ {SMS_TEMPLATE_WHEN_SENT[key]}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                          <code style={styles.keyCode}>{key}</code>
                          <span style={{ color: theme.colors.textMuted, fontSize: 12, transition: 'transform 0.15s', transform: isOpen ? 'rotate(180deg)' : 'none', display: 'inline-block' }}>▼</span>
                        </div>
                      </button>

                      {/* SMS preview bubble */}
                      <div style={styles.previewStrip}>
                        <div style={styles.smsChrome}>
                          <div style={styles.smsBubble}>
                            <p style={styles.smsText}>{smsPreviews[key]}</p>
                          </div>
                        </div>
                      </div>

                      {isOpen && (
                        <div style={styles.editPanel}>
                          <div style={styles.chipsRow}>
                            <span style={styles.chipsLabel}>הוספת משתנה:</span>
                            {SMS_TEMPLATE_VAR_NAMES.map((v) => (
                              <button
                                key={v + key}
                                type="button"
                                onClick={() =>
                                  insertVarAtCursor(smsTextareaRefs.current[key] ?? null, smsDrafts[key] || '', `{{${v}}}`, (next) =>
                                    setSmsDrafts((d) => ({ ...d, [key]: next }))
                                  )
                                }
                                style={styles.chip}
                              >
                                {`{{${v}}}`}
                              </button>
                            ))}
                          </div>
                          <textarea
                            ref={setSmsRef(key)}
                            dir="rtl"
                            value={smsDrafts[key] || ''}
                            onChange={(e) => setSmsDrafts((d) => ({ ...d, [key]: e.target.value }))}
                            rows={6}
                            style={styles.textarea}
                          />
                          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => saveSmsKey(key)}
                              loading={smsSavingKey === key}
                            >
                              שמור תבנית זו
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {WHATSAPP_TEMPLATE_JOURNEY.map((step, si) => (
              <div key={step.step} style={styles.stepSection}>
                {/* Step header */}
                <div style={styles.stepHeader}>
                  <div style={{ ...styles.stepBadge, background: STEP_COLORS[si] ?? '#6b7280' }}>
                    {step.step}
                  </div>
                  <div>
                    <div style={styles.stepTitle}>{step.title}</div>
                    <div style={styles.stepDesc}>{step.description}</div>
                  </div>
                </div>

                {/* Templates in this step */}
                <div style={styles.templateList}>
                  {step.keys.map((key) => {
                    const isOpen = expandedKeys.has(key)
                    return (
                      <div key={key} style={styles.templateCard}>
                        {/* Card header — always visible, click to expand */}
                        <button
                          onClick={() => toggleExpand(key)}
                          style={styles.templateCardHeader}
                        >
                          <div style={{ flex: 1, textAlign: 'right' }}>
                            <div style={styles.templateLabel}>{WHATSAPP_TEMPLATE_LABELS[key]}</div>
                            <div style={styles.whenSent}>⚡ {WHATSAPP_TEMPLATE_WHEN_SENT[key]}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                            <code style={styles.keyCode}>{key}</code>
                            <span style={{ color: theme.colors.textMuted, fontSize: 12, transition: 'transform 0.15s', transform: isOpen ? 'rotate(180deg)' : 'none', display: 'inline-block' }}>▼</span>
                          </div>
                        </button>

                        {/* Preview bubble — always visible */}
                        <div style={styles.previewStrip}>
                          <div style={styles.waChrome}>
                            <div style={styles.waBubble}>
                              <p style={styles.waText}>{previews[key]}</p>
                              <span style={styles.waTime}>14:02</span>
                            </div>
                          </div>
                        </div>

                        {/* Edit panel — only when expanded */}
                        {isOpen && (
                          <div style={styles.editPanel}>
                            <div style={styles.chipsRow}>
                              <span style={styles.chipsLabel}>הוספת משתנה:</span>
                              {WHATSAPP_TEMPLATE_VAR_NAMES.map((v) => chip(`{{${v}}}`, key))}
                            </div>
                            <textarea
                              ref={setRef(key)}
                              dir="rtl"
                              value={drafts[key] || ''}
                              onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                              rows={6}
                              style={styles.textarea}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => saveKey(key)}
                                loading={savingKey === key}
                              >
                                שמור תבנית זו
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}

            <div style={styles.stepSection}>
              <div style={styles.stepHeader}>
                <div style={{ ...styles.stepBadge, background: '#9ca3af' }}>—</div>
                <div>
                  <div style={styles.stepTitle}>תבניות מיקום (לא בשימוש ב-webhook)</div>
                  <div style={styles.stepDesc}>נשמרות לתאימות; דייר ששולח מיקום מקבל redirect_to_text</div>
                </div>
              </div>
              <div style={styles.templateList}>
                {WHATSAPP_ARCHIVED_TEMPLATE_KEYS.map((key) => (
                  <div key={key} style={{ ...styles.templateCard, opacity: 0.85 }}>
                    <div style={styles.templateCardHeader}>
                      <div style={{ flex: 1, textAlign: 'right' }}>
                        <div style={styles.templateLabel}>{WHATSAPP_TEMPLATE_LABELS[key]}</div>
                        <div style={styles.whenSent}>⚡ {WHATSAPP_TEMPLATE_WHEN_SENT[key]}</div>
                      </div>
                      <code style={styles.keyCode}>{key}</code>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}

const styles: Record<string, CSSProperties> = {
  content: { padding: '32px 40px', maxWidth: 820, margin: '0 auto' },
  backLink: { fontSize: 14, fontWeight: 600, color: theme.colors.primary, textDecoration: 'none' },
  syncBanner: {
    marginBottom: 20,
    padding: '12px 16px',
    borderRadius: 10,
    background: '#fffbeb',
    border: '1px solid #fcd34d',
    fontSize: 13,
    color: theme.colors.textPrimary,
    lineHeight: 1.5,
  },
  syncBannerLink: {
    background: 'none',
    border: 'none',
    padding: 0,
    color: theme.colors.primary,
    fontWeight: 700,
    cursor: 'pointer',
    textDecoration: 'underline',
    fontSize: 'inherit',
  },
  inlineCode: { fontSize: 12, background: '#f3f4f6', padding: '1px 6px', borderRadius: 4 },
  journey: { display: 'flex', flexDirection: 'column', gap: 40 },

  stepSection: { display: 'flex', flexDirection: 'column', gap: 12 },
  stepHeader: { display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 4 },
  stepBadge: {
    width: 32, height: 32, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontWeight: 700, fontSize: 15, flexShrink: 0, marginTop: 2,
  },
  stepTitle: { fontSize: 17, fontWeight: 700, color: theme.colors.textPrimary },
  stepDesc: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },

  templateList: { display: 'flex', flexDirection: 'column', gap: 8 },
  templateCard: {
    background: theme.colors.surface,
    border: `1.5px solid ${theme.colors.border}`,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
  },
  templateCardHeader: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 16,
    padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer',
    borderBottom: `1px solid ${theme.colors.borderSubtle}`,
    textAlign: 'right',
  },
  templateLabel: { fontSize: 14, fontWeight: 600, color: theme.colors.textPrimary },
  whenSent: { fontSize: 12, color: theme.colors.textMuted, marginTop: 3 },
  keyCode: {
    fontSize: 11, color: theme.colors.textMuted, background: theme.colors.muted,
    padding: '2px 8px', borderRadius: theme.radius.xs, fontFamily: 'monospace',
    whiteSpace: 'nowrap',
  },

  previewStrip: { padding: '12px 18px', background: theme.colors.muted },
  waChrome: {
    background: '#ECE5DD', borderRadius: theme.radius.md,
    padding: '10px 12px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
    border: `1px solid ${theme.colors.border}`,
  },
  waBubble: {
    maxWidth: '88%', background: '#DCF8C6',
    borderRadius: '12px 12px 4px 12px', padding: '8px 12px 20px',
    position: 'relative', boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
  },
  waText: { margin: 0, fontSize: 14, lineHeight: 1.45, color: '#111', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  waTime: { position: 'absolute', bottom: 5, left: 10, fontSize: 11, color: 'rgba(0,0,0,0.45)' },

  smsChrome: {
    background: '#f0f4f8', borderRadius: theme.radius.md,
    padding: '10px 12px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
    border: `1px solid ${theme.colors.border}`,
  },
  smsBubble: {
    maxWidth: '88%', background: '#e2e8f0',
    borderRadius: '4px 18px 18px 18px', padding: '10px 14px',
    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
  },
  smsText: { margin: 0, fontSize: 14, lineHeight: 1.5, color: '#1e293b', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace' },

  editPanel: {
    padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12,
    borderTop: `1.5px solid ${theme.colors.border}`,
    background: theme.colors.surface,
  },
  chipsRow: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chipsLabel: { fontSize: 13, fontWeight: 600, color: theme.colors.textSecondary },
  chip: {
    border: `1px solid ${theme.colors.borderStrong}`, background: theme.colors.muted,
    borderRadius: theme.radius.full, padding: '3px 10px', fontSize: 12,
    cursor: 'pointer', color: theme.colors.primary, fontWeight: 600,
  },
  textarea: {
    width: '100%', boxSizing: 'border-box', borderRadius: theme.radius.md,
    border: `1.5px solid ${theme.colors.border}`, padding: '12px 14px',
    fontSize: 15, lineHeight: 1.5, resize: 'vertical', fontFamily: 'inherit',
    direction: 'rtl',
  },
}
