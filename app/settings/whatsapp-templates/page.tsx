'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { resolveBamakorClientIdForBrowser } from '@/lib/bamakor-client'
import {
  WHATSAPP_TEMPLATE_KEYS,
  type WhatsAppTemplateKey,
  type WhatsAppTemplateCategory,
  WHATSAPP_TEMPLATE_LABELS,
  WHATSAPP_TEMPLATE_EDITOR_DEFAULTS,
  WHATSAPP_TEMPLATE_VAR_NAMES,
  WHATSAPP_TEMPLATE_CATEGORIES,
  WHATSAPP_TEMPLATE_CATEGORY_LABELS,
} from '@/lib/whatsapp-template-keys'
import { interpolateWhatsAppTemplate } from '@/lib/whatsapp-templates'
import { toast } from '@/lib/error-handler'
import { TM } from '@/lib/toast-messages'
import {
  AppShell,
  MobileHeader,
  MobileMenu,
  PageHeader,
  Card,
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

const CATEGORY_ORDER: WhatsAppTemplateCategory[] = [
  'flow',
  'building',
  'location',
  'image',
  'unsupported',
  'general',
]

function insertVarAtCursor(
  el: HTMLTextAreaElement | null,
  value: string,
  token: string,
  onChange: (next: string) => void
) {
  if (!el) {
    onChange(value + token)
    return
  }
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
  const [savingKey, setSavingKey] = useState<WhatsAppTemplateKey | null>(null)
  const textareaRefs = useRef<Partial<Record<WhatsAppTemplateKey, HTMLTextAreaElement | null>>>({})

  const setRef = useCallback((key: WhatsAppTemplateKey) => {
    return (el: HTMLTextAreaElement | null) => {
      textareaRefs.current[key] = el
    }
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

        if (error) {
          if (!error.message.includes('does not exist') && !error.message.includes('schema cache')) {
            throw error
          }
        }

        const next = { ...WHATSAPP_TEMPLATE_EDITOR_DEFAULTS }
        for (const row of (data || []) as { template_key: string; template_text: string }[]) {
          const k = row.template_key as WhatsAppTemplateKey
          if (WHATSAPP_TEMPLATE_KEYS.includes(k)) {
            next[k] = row.template_text
          }
        }
        if (!cancelled) setDrafts(next)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'טעינה נכשלה')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  async function saveKey(key: WhatsAppTemplateKey) {
    if (!clientId) return
    setSavingKey(key)
    try {
      const { error } = await supabase.from('whatsapp_templates').upsert(
        {
          client_id: clientId,
          template_key: key,
          template_text: drafts[key] || '',
          updated_at: new Date().toISOString(),
        },
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

  const previews = useMemo(() => {
    const m: Record<WhatsAppTemplateKey, string> = { ...drafts }
    for (const k of WHATSAPP_TEMPLATE_KEYS) {
      m[k] = interpolateWhatsAppTemplate(drafts[k] || '', PREVIEW_SAMPLE)
    }
    return m
  }, [drafts])

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

  const keysByCategory = useMemo(() => {
    const map: Partial<Record<WhatsAppTemplateCategory, WhatsAppTemplateKey[]>> = {}
    for (const key of WHATSAPP_TEMPLATE_KEYS) {
      const cat = WHATSAPP_TEMPLATE_CATEGORIES[key]
      if (!map[cat]) map[cat] = []
      map[cat]!.push(key)
    }
    return map
  }, [])

  return (
    <AppShell isMobile={isMobile}>
      {isMobile && (
        <MobileHeader
          title="תבניות וואטסאפ"
          subtitle="הודעות אוטומטיות"
          onMenuClick={() => setMenuOpen(true)}
        />
      )}
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div style={styles.content}>
        {!isMobile && (
          <PageHeader
            title="תבניות הודעות וואטסאפ"
            subtitle="עריכת כל הטקסטים שנשלחים לדיירים — אין שום הודעה hardcoded במערכת"
            actions={
              <Link href="/settings" style={styles.backLink}>
                ← חזרה להגדרות
              </Link>
            }
          />
        )}
        {isMobile && (
          <div style={{ marginBottom: '16px' }}>
            <Link href="/settings" style={styles.backLink}>
              ← חזרה להגדרות
            </Link>
          </div>
        )}

        {loading ? (
          <div style={styles.loading}>
            <PageListSkeleton rows={6} />
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
              <LoadingSpinner size="md" />
            </div>
          </div>
        ) : (
          <div style={styles.sections}>
            {CATEGORY_ORDER.map((cat) => {
              const keys = keysByCategory[cat]
              if (!keys?.length) return null
              return (
                <div key={cat}>
                  <div style={styles.categoryHeader}>{WHATSAPP_TEMPLATE_CATEGORY_LABELS[cat]}</div>
                  <div style={styles.grid}>
                    {keys.map((key) => (
                      <Card key={key} title={WHATSAPP_TEMPLATE_LABELS[key]} noPadding>
                        <div style={styles.cardInner}>
                          <div style={styles.readonlyKey}>מפתח מערכת: {key}</div>

                          <div style={styles.chipsRow}>
                            <span style={styles.chipsLabel}>משתנים:</span>
                            {WHATSAPP_TEMPLATE_VAR_NAMES.map((v) => chip(`{{${v}}}`, key))}
                          </div>

                          <label style={styles.lab}>תוכן ההודעה</label>
                          <textarea
                            ref={setRef(key)}
                            dir="rtl"
                            value={drafts[key] || ''}
                            onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                            rows={5}
                            style={styles.textarea}
                          />

                          <div style={styles.previewBlock}>
                            <div style={styles.previewLabel}>תצוגה מקדימה</div>
                            <div style={styles.waChrome}>
                              <div style={styles.waBubble}>
                                <p style={styles.waText}>{previews[key]}</p>
                                <span style={styles.waTime}>14:02</span>
                              </div>
                            </div>
                          </div>

                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => saveKey(key)}
                            loading={savingKey === key}
                            style={{ alignSelf: 'flex-start' }}
                          >
                            שמירה
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppShell>
  )
}

const styles: Record<string, CSSProperties> = {
  content: { padding: '32px 40px', maxWidth: '960px', margin: '0 auto' },
  backLink: {
    fontSize: '14px',
    fontWeight: 600,
    color: theme.colors.primary,
    textDecoration: 'none',
  },
  loading: { padding: '48px', display: 'flex', justifyContent: 'center' },
  sections: { display: 'flex', flexDirection: 'column', gap: '32px' },
  categoryHeader: {
    fontSize: '16px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
    marginBottom: '12px',
    paddingBottom: '8px',
    borderBottom: `2px solid ${theme.colors.border}`,
  },
  grid: { display: 'flex', flexDirection: 'column', gap: '16px' },
  cardInner: { padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '12px' },
  readonlyKey: {
    fontSize: '12px',
    color: theme.colors.textMuted,
    fontFamily: 'ui-monospace, monospace',
  },
  chipsRow: { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' },
  chipsLabel: { fontSize: '13px', fontWeight: 600, color: theme.colors.textSecondary },
  chip: {
    border: `1px solid ${theme.colors.borderStrong}`,
    background: theme.colors.muted,
    borderRadius: theme.radius.full,
    padding: '4px 10px',
    fontSize: '12px',
    cursor: 'pointer',
    color: theme.colors.primary,
    fontWeight: 600,
  },
  lab: { fontSize: '13px', fontWeight: 600, color: theme.colors.textSecondary },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    padding: '12px 14px',
    fontSize: '15px',
    lineHeight: 1.5,
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  previewBlock: { marginTop: '4px' },
  previewLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.colors.textMuted,
    marginBottom: '8px',
  },
  waChrome: {
    background: '#ECE5DD',
    borderRadius: theme.radius.lg,
    padding: '16px 12px',
    minHeight: '80px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    border: `1px solid ${theme.colors.border}`,
  },
  waBubble: {
    maxWidth: '92%',
    background: '#DCF8C6',
    borderRadius: '12px 12px 4px 12px',
    padding: '10px 12px 18px',
    position: 'relative',
    boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
  },
  waText: {
    margin: 0,
    fontSize: '15px',
    lineHeight: 1.45,
    color: '#111',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  waTime: {
    position: 'absolute',
    bottom: '6px',
    left: '10px',
    fontSize: '11px',
    color: 'rgba(0,0,0,0.45)',
  },
}
