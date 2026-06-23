'use client'



import { useState, type CSSProperties } from 'react'

import { theme } from '../ui'

import {

  META_LIVE_DISPLAY_PHONE,

  META_LIVE_WABA_ID,

  META_WHATSAPP_PENDING_ACTIONS,

  type MetaPendingAction,

} from '@/lib/meta-whatsapp-pending-actions'

import {

  META_WHATSAPP_TEMPLATE_SPECS,

  formatMetaTemplateSpecForCopy,

} from '@/lib/meta-whatsapp-template-specs'



function statusLabel(status: MetaPendingAction['status']): string {

  if (status === 'submitted') return 'ממתין ל-Meta'

  if (status === 'todo') return 'לעשות'

  return 'אופציונלי'

}



function statusColor(status: MetaPendingAction['status']): string {

  if (status === 'submitted') return theme.colors.warning

  if (status === 'todo') return theme.colors.error

  return theme.colors.textMuted

}



function templateStatusLabel(status: 'submitted' | 'todo' | 'approved'): string {

  if (status === 'submitted') return 'ממתין לאישור'

  if (status === 'approved') return 'מאושר'

  return 'ליצור'

}



export function MetaWhatsAppPendingPanel() {

  const [expandedId, setExpandedId] = useState<string | null>('sla_escalation')

  const [copiedId, setCopiedId] = useState<string | null>(null)



  async function copySpec(id: string) {

    const spec = META_WHATSAPP_TEMPLATE_SPECS.find((s) => s.id === id)

    if (!spec) return

    const text = formatMetaTemplateSpecForCopy(spec)

    try {

      await navigator.clipboard.writeText(text)

      setCopiedId(id)

      setTimeout(() => setCopiedId(null), 2000)

    } catch {

      /* ignore */

    }

  }



  return (

    <aside style={styles.wrap} aria-label="תבניות Meta — להגדרה ידנית">

      <h3 style={styles.title}>תבניות Meta — העתקה ליצירה</h3>

      <p style={styles.sub}>

        חשבון פעיל: <strong>{META_LIVE_DISPLAY_PHONE}</strong>

        <br />

        <code style={styles.code}>WABA {META_LIVE_WABA_ID}</code>

      </p>



      <div style={styles.specList}>

        {META_WHATSAPP_TEMPLATE_SPECS.map((spec) => {

          const open = expandedId === spec.id

          return (

            <div key={spec.id} style={styles.specCard}>

              <button

                type="button"

                style={styles.specHead}

                onClick={() => setExpandedId(open ? null : spec.id)}

              >

                <span style={styles.specTitle}>{spec.metaName}</span>

                <span style={styles.specBadge}>{templateStatusLabel(spec.status)}</span>

              </button>

              {open && (

                <div style={styles.specBody}>

                  <p style={styles.specPurpose}>{spec.purpose}</p>

                  <dl style={styles.dl}>

                    <dt>קטגוריה</dt>

                    <dd>{spec.category}</dd>

                    <dt>שפה</dt>

                    <dd>{spec.languageLabel}</dd>

                    <dt>גוף ההודעה</dt>

                    <dd>

                      <pre style={styles.pre}>{spec.body}</pre>

                    </dd>

                    {spec.variables.map((v) => (

                      <div key={v.index}>

                        <dt>{`{{${v.index}}} — ${v.label}`}</dt>

                        <dd>דוגמה: {v.sample}</dd>

                      </div>

                    ))}

                  </dl>

                  {spec.notes.length > 0 && (

                    <ul style={styles.notes}>

                      {spec.notes.map((n) => (

                        <li key={n}>{n}</li>

                      ))}

                    </ul>

                  )}

                  <button type="button" style={styles.copyBtn} onClick={() => void copySpec(spec.id)}>

                    {copiedId === spec.id ? 'הועתק ✓' : 'העתק הכל ל-Meta'}

                  </button>

                  <a

                    href="https://business.facebook.com/wa/manage/message-templates/"

                    target="_blank"

                    rel="noopener noreferrer"

                    style={styles.link}

                  >

                    פתח יצירת תבנית ב-Meta ↗

                  </a>

                </div>

              )}

            </div>

          )

        })}

      </div>



      <h4 style={styles.sectionTitle}>משימות נוספות</h4>

      <ul style={styles.list}>

        {META_WHATSAPP_PENDING_ACTIONS.filter((a) => !['ticket_closed', 'sla_escalation', 'manager_reply'].includes(a.id)).map(

          (item) => (

            <li key={item.id} style={styles.item}>

              <div style={styles.itemHead}>

                <span style={styles.itemTitle}>{item.title}</span>

                <span

                  style={{

                    ...styles.badge,

                    color: statusColor(item.status),

                    borderColor: statusColor(item.status),

                  }}

                >

                  {statusLabel(item.status)}

                </span>

              </div>

              <p style={styles.itemDesc}>{item.description}</p>

              {item.href ? (

                <a href={item.href} target="_blank" rel="noopener noreferrer" style={styles.link}>

                  פתח ב-Meta ↗

                </a>

              ) : null}

            </li>

          )

        )}

      </ul>

      <p style={styles.foot}>מנהלי בניין לא רואים את המסך הזה — רק את תיבת WhatsApp הפשוטה.</p>

    </aside>

  )

}



const styles: Record<string, CSSProperties> = {

  wrap: {

    padding: '16px 18px',

    borderRadius: theme.radius.lg,

    border: `1.5px solid ${theme.colors.border}`,

    background: theme.colors.muted,

    position: 'sticky' as const,

    top: 16,

    alignSelf: 'start',

  },

  title: { margin: '0 0 8px', fontSize: 15, fontWeight: 700, color: theme.colors.textPrimary },

  sectionTitle: { margin: '16px 0 8px', fontSize: 13, fontWeight: 700, color: theme.colors.textPrimary },

  sub: { margin: '0 0 14px', fontSize: 12, lineHeight: 1.5, color: theme.colors.textSecondary },

  code: {

    fontSize: 11,

    fontFamily: 'monospace',

    background: theme.colors.surface,

    padding: '2px 6px',

    borderRadius: 4,

  },

  specList: { display: 'flex', flexDirection: 'column', gap: 8 },

  specCard: {

    borderRadius: theme.radius.md,

    background: theme.colors.surface,

    border: `1px solid ${theme.colors.borderSubtle}`,

    overflow: 'hidden',

  },

  specHead: {

    display: 'flex',

    justifyContent: 'space-between',

    alignItems: 'center',

    width: '100%',

    padding: '10px 12px',

    border: 'none',

    background: 'transparent',

    cursor: 'pointer',

    textAlign: 'right',

  },

  specTitle: { fontSize: 13, fontWeight: 700, fontFamily: 'monospace', color: theme.colors.textPrimary },

  specBadge: { fontSize: 10, fontWeight: 700, color: theme.colors.textMuted },

  specBody: { padding: '0 12px 12px', borderTop: `1px solid ${theme.colors.borderSubtle}` },

  specPurpose: { margin: '10px 0', fontSize: 12, color: theme.colors.textSecondary, lineHeight: 1.45 },

  dl: { margin: 0, fontSize: 12 },

  pre: {

    margin: '4px 0 0',

    padding: '8px 10px',

    borderRadius: theme.radius.sm,

    background: theme.colors.muted,

    whiteSpace: 'pre-wrap',

    fontFamily: 'inherit',

    fontSize: 12,

    lineHeight: 1.45,

  },

  notes: { margin: '8px 0 0', paddingInlineStart: 18, fontSize: 11, color: theme.colors.textMuted },

  copyBtn: {

    marginTop: 10,

    padding: '8px 12px',

    borderRadius: theme.radius.md,

    border: `1px solid ${theme.colors.primary}`,

    background: theme.colors.primaryMuted,

    color: theme.colors.primary,

    fontWeight: 700,

    fontSize: 12,

    cursor: 'pointer',

    width: '100%',

  },

  list: { margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 },

  item: {

    padding: '10px 12px',

    borderRadius: theme.radius.md,

    background: theme.colors.surface,

    border: `1px solid ${theme.colors.borderSubtle}`,

  },

  itemHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 },

  itemTitle: { fontSize: 13, fontWeight: 600, color: theme.colors.textPrimary, lineHeight: 1.35 },

  badge: {

    fontSize: 10,

    fontWeight: 700,

    padding: '2px 8px',

    borderRadius: 999,

    border: '1px solid',

    whiteSpace: 'nowrap',

    flexShrink: 0,

  },

  itemDesc: { margin: '0 0 6px', fontSize: 12, lineHeight: 1.45, color: theme.colors.textMuted },

  link: { fontSize: 12, color: theme.colors.primary, fontWeight: 600, textDecoration: 'none', display: 'inline-block', marginTop: 6 },

  foot: { margin: '14px 0 0', fontSize: 11, color: theme.colors.textMuted, lineHeight: 1.4 },

}


