'use client'



import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

import { supabase } from '@/lib/supabase'

import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

import { toast } from '@/lib/error-handler'

import { formatWhatsAppInboxDisplayLabel } from '@/lib/whatsapp-inbox-display'

import {

  buildInboxTemplatePreview,

  type InboxMetaTemplate,

} from '@/lib/whatsapp-inbox-meta-templates'

import {

  inboxTemplateParamsFromContext,

  type WhatsAppInboxContext,

} from '@/lib/whatsapp-inbox-context'

import { Button, Card, theme } from '../ui'



type Conversation = {

  id: string

  phone: string

  last_message_at: string

  last_message_preview: string | null

  residents?: { full_name?: string; apartment_number?: string | null } | { full_name?: string; apartment_number?: string | null }[] | null

}



type Message = {

  id: string

  direction: 'in' | 'out'

  body: string | null

  created_at: string

  ticket_id: string | null

}



type InboxTemplateOption = {

  id: string

  label: string

  description: string

  params: { key: string; label: string; placeholder: string; maxLength: number }[]

  preview: string

}



const QUICK_ACTIONS: { templateId: string; title: string; hint: string }[] = [

  {

    templateId: 'ticket_closed',

    title: 'התקלה נסגרה',

    hint: 'עדכון שהטיפול הסתיים',

  },

  {

    templateId: 'sla_escalation',

    title: 'עדיין בטיפול',

    hint: 'עדכון על תקלה פתוחה',

  },

]



export function WhatsAppInboxPanel() {

  const [conversations, setConversations] = useState<Conversation[]>([])

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [messages, setMessages] = useState<Message[]>([])

  const [loading, setLoading] = useState(true)

  const [reply, setReply] = useState('')

  const [sending, setSending] = useState(false)

  const [inSession, setInSession] = useState(true)

  const [sessionLoading, setSessionLoading] = useState(false)

  const [templates, setTemplates] = useState<InboxTemplateOption[]>([])

  const [inboxContext, setInboxContext] = useState<WhatsAppInboxContext | null>(null)

  const [contextLoading, setContextLoading] = useState(false)

  const [activeQuickAction, setActiveQuickAction] = useState<string | null>(null)

  const [templateParams, setTemplateParams] = useState<string[]>([])

  const bottomRef = useRef<HTMLDivElement>(null)

  const messagesLoadSeq = useRef(0)



  const selected = conversations.find((c) => c.id === selectedId) ?? null

  const activeTemplate = templates.find((t) => t.id === activeQuickAction) ?? null



  const loadConversations = useCallback(async () => {

    setLoading(true)

    try {

      const res = await fetchWithTimeout('/api/whatsapp/conversations')

      const json = (await res.json()) as { conversations?: Conversation[]; error?: string }

      if (!res.ok) throw new Error(json.error || 'טעינה נכשלה')

      setConversations(json.conversations ?? [])

    } catch (e) {

      toast.error(e instanceof Error ? e.message : 'טעינה נכשלה')

    } finally {

      setLoading(false)

    }

  }, [])



  const loadMessages = useCallback(async (conversationId: string) => {

    const seq = ++messagesLoadSeq.current

    try {

      const res = await fetchWithTimeout(`/api/whatsapp/messages?conversation_id=${conversationId}`)

      const json = (await res.json()) as { messages?: Message[]; error?: string }

      if (!res.ok) throw new Error(json.error || 'טעינת הודעות נכשלה')

      if (seq !== messagesLoadSeq.current) return

      setMessages(json.messages ?? [])

    } catch (e) {

      if (seq !== messagesLoadSeq.current) return

      toast.error(e instanceof Error ? e.message : 'טעינת הודעות נכשלה')

    }

  }, [])



  const loadSessionStatus = useCallback(async (phone: string) => {

    setSessionLoading(true)

    try {

      const res = await fetchWithTimeout(

        `/api/whatsapp/session-status?phone=${encodeURIComponent(phone)}`

      )

      const json = (await res.json()) as {

        in_session?: boolean

        templates?: InboxTemplateOption[]

        error?: string

      }

      if (!res.ok) throw new Error(json.error || 'בדיקה נכשלה')

      setInSession(json.in_session !== false)

      setTemplates(json.templates ?? [])

    } catch (e) {

      toast.error(e instanceof Error ? e.message : 'בדיקה נכשלה')

      setInSession(false)

      setTemplates([])

    } finally {

      setSessionLoading(false)

    }

  }, [])



  const loadContext = useCallback(async (conversationId: string) => {

    setContextLoading(true)

    try {

      const res = await fetchWithTimeout(

        `/api/whatsapp/conversation-context?conversation_id=${conversationId}`

      )

      const json = (await res.json()) as { context?: WhatsAppInboxContext; error?: string }

      if (!res.ok) throw new Error(json.error || 'טעינת פרטים נכשלה')

      setInboxContext(json.context ?? null)

    } catch {

      setInboxContext(null)

    } finally {

      setContextLoading(false)

    }

  }, [])



  useEffect(() => {

    void loadConversations()

  }, [loadConversations])



  useEffect(() => {

    if (!selectedId || !selected) return

    setActiveQuickAction(null)

    setTemplateParams([])

    void loadMessages(selectedId)

    void loadSessionStatus(selected.phone)

    void loadContext(selectedId)



    const channel = supabase

      .channel(`wa-inbox:${selectedId}`)

      .on(

        'postgres_changes',

        { event: 'INSERT', schema: 'public', table: 'whatsapp_messages', filter: `conversation_id=eq.${selectedId}` },

        () => {

          void loadMessages(selectedId)

          void loadConversations()

        }

      )

      .subscribe()



    return () => {

      void supabase.removeChannel(channel)

    }

  }, [selectedId, selected, loadMessages, loadConversations, loadSessionStatus, loadContext])



  useEffect(() => {

    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })

  }, [messages.length])



  function pickQuickAction(templateId: string) {

    if (!inboxContext) {

      setActiveQuickAction(templateId)

      setTemplateParams([])

      return

    }

    setActiveQuickAction(templateId)

    setTemplateParams(inboxTemplateParamsFromContext(templateId, inboxContext))

  }



  function missingParamIndices(template: InboxTemplateOption, params: string[]): number[] {

    return template.params

      .map((_, i) => i)

      .filter((i) => !params[i]?.trim())

  }



  async function sendReply() {

    if (!selected || !reply.trim()) return

    setSending(true)

    try {

      const res = await fetchWithTimeout('/api/whatsapp/send', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ phone: selected.phone, body: reply.trim(), conversation_id: selected.id }),

      })

      const json = (await res.json()) as { error?: string; code?: string }

      if (!res.ok) {

        if (json.code === 'WA_SESSION_EXPIRED') {

          setInSession(false)

          toast.error('לא ניתן לכתוב חופשי — בחרו הודעה מוכנה למטה')

          return

        }

        throw new Error(json.error || 'שליחה נכשלה')

      }

      setReply('')

      await loadMessages(selected.id)

      await loadConversations()

    } catch (e) {

      toast.error(e instanceof Error ? e.message : 'שליחה נכשלה')

    } finally {

      setSending(false)

    }

  }



  async function sendQuickAction() {

    if (!selected || !activeQuickAction || !activeTemplate) return

    if (missingParamIndices(activeTemplate, templateParams).length > 0) {

      toast.error('חסר מידע — מלאו את השדה הריק')

      return

    }

    setSending(true)

    try {

      const res = await fetchWithTimeout('/api/whatsapp/send-template', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({

          phone: selected.phone,

          template_id: activeQuickAction,

          params: templateParams,

          conversation_id: selected.id,

        }),

      })

      const json = (await res.json()) as { error?: string }

      if (!res.ok) throw new Error(json.error || 'שליחה נכשלה')

      toast.success('ההודעה נשלחה לדייר')

      setActiveQuickAction(null)

      setTemplateParams([])

      await loadMessages(selected.id)

      await loadConversations()

    } catch (e) {

      toast.error(e instanceof Error ? e.message : 'שליחה נכשלה')

    } finally {

      setSending(false)

    }

  }



  function residentLabel(c: Conversation): string {

    const r = Array.isArray(c.residents) ? c.residents[0] : c.residents

    return formatWhatsAppInboxDisplayLabel(c.phone, r)

  }



  function templatePreviewFor(template: InboxTemplateOption, params: string[]): string {

    return buildInboxTemplatePreview(

      {

        id: template.id,

        label: template.label,

        description: template.description,

        language: 'he',

        resolveMetaName: () => '',

        preview: template.preview,

        params: template.params,

      } as InboxMetaTemplate,

      params

    )

  }



  return (

    <Card noPadding style={{ overflow: 'hidden' }}>

      <p style={styles.helpBanner}>

        בחרו דייר/ה מהרשימה משמאל וכתבו הודעה — אין צורך להקליד מספר טלפון.

      </p>

      <div style={styles.wrap}>

        <aside style={styles.list} aria-label="רשימת דיירים">

          {loading ? (

            <p style={styles.muted}>טוען…</p>

          ) : conversations.length === 0 ? (

            <p style={styles.muted}>עדיין אין שיחות — כשדייר/ה יכתוב/תכתוב, השיחה תופיע כאן.</p>

          ) : (

            conversations.map((c) => (

              <button

                key={c.id}

                type="button"

                style={{

                  ...styles.listItem,

                  ...(selectedId === c.id ? styles.listItemActive : {}),

                }}

                onClick={() => setSelectedId(c.id)}

                aria-pressed={selectedId === c.id}

              >

                <div style={styles.listTitle}>{residentLabel(c)}</div>

                <div style={styles.listPreview}>{c.last_message_preview || '—'}</div>

              </button>

            ))

          )}

        </aside>



        <section style={styles.thread} aria-label="שיחה">

          {!selected ? (

            <div style={styles.emptyThread}>

              <p style={styles.emptyTitle}>← בחרו דייר/ה מהרשימה</p>

              <p style={styles.muted}>המערכת מזהה את הטלפון אוטומטית.</p>

            </div>

          ) : (

            <>

              <div style={styles.threadHeader}>

                <span>{residentLabel(selected)}</span>

                {!sessionLoading && (

                  <span style={inSession ? styles.badgeOpen : styles.badgeClosed}>

                    {inSession ? 'אפשר לכתוב חופשי' : 'רק הודעות מוכנות'}

                  </span>

                )}

              </div>

              <div style={styles.messages} role="log" aria-live="polite">

                {messages.map((m) => (

                  <div

                    key={m.id}

                    style={{

                      ...styles.bubble,

                      ...(m.direction === 'out' ? styles.bubbleOut : styles.bubbleIn),

                    }}

                  >

                    {m.body || '—'}

                    <div style={styles.time}>

                      {new Date(m.created_at).toLocaleString('he-IL', { hour: '2-digit', minute: '2-digit' })}

                    </div>

                  </div>

                ))}

                <div ref={bottomRef} />

              </div>



              <div style={styles.compose}>

                {inSession && (

                  <>

                    <label htmlFor="wa-reply" style={styles.composeLabel}>

                      הודעה לדייר/ה

                    </label>

                    <textarea

                      id="wa-reply"

                      value={reply}

                      onChange={(e) => setReply(e.target.value)}

                      rows={2}

                      placeholder="כתבו כאן…"

                      style={styles.textarea}

                    />

                    <Button onClick={() => void sendReply()} disabled={sending || !reply.trim()}>

                      {sending ? 'שולח…' : 'שלח הודעה'}

                    </Button>

                  </>

                )}



                {!inSession && (

                  <p style={styles.closedHint}>

                    הדייר/ה לא כתב/ה לאחרונה — אפשר לשלוח רק הודעה מוכנה מהרשימה:

                  </p>

                )}



                {!inSession && templates.length > 0 && (

                  <div style={styles.quickActions}>

                    <div style={styles.quickActionsTitle}>הודעות מוכנות</div>

                    <div style={styles.quickGrid}>

                      {QUICK_ACTIONS.filter((qa) => templates.some((t) => t.id === qa.templateId)).map(

                        (qa) => {

                          const tpl = templates.find((t) => t.id === qa.templateId)!

                          const isActive = activeQuickAction === qa.templateId

                          const disabled =

                            qa.templateId === 'sla_escalation' &&

                            (contextLoading || !inboxContext?.open_ticket)

                          return (

                            <button

                              key={qa.templateId}

                              type="button"

                              disabled={disabled}

                              style={{

                                ...styles.quickBtn,

                                ...(isActive ? styles.quickBtnActive : {}),

                                ...(disabled ? styles.quickBtnDisabled : {}),

                              }}

                              onClick={() => !disabled && pickQuickAction(qa.templateId)}

                            >

                              <span style={styles.quickBtnTitle}>{qa.title}</span>

                              <span style={styles.quickBtnHint}>

                                {disabled ? 'אין תקלה פתוחה לדייר/ה' : qa.hint}

                              </span>

                            </button>

                          )

                        }

                      )}

                    </div>

                  </div>

                )}



                {activeQuickAction && activeTemplate && (

                  <div style={styles.quickPanel}>

                    {missingParamIndices(activeTemplate, templateParams).map((i) => {

                      const p = activeTemplate.params[i]

                      if (!p) return null

                      return (

                        <div key={p.key}>

                          <label htmlFor={`wa-q-${p.key}`} style={styles.composeLabel}>

                            {p.label}

                          </label>

                          <input

                            id={`wa-q-${p.key}`}

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

                      )

                    })}

                    <div style={styles.previewBox}>

                      <div style={styles.previewLabel}>כך תיראה ההודעה:</div>

                      <div style={styles.previewText}>

                        {templatePreviewFor(activeTemplate, templateParams)}

                      </div>

                    </div>

                    <Button

                      onClick={() => void sendQuickAction()}

                      disabled={

                        sending ||

                        missingParamIndices(activeTemplate, templateParams).length > 0

                      }

                    >

                      {sending ? 'שולח…' : 'שלח לדייר/ה'}

                    </Button>

                  </div>

                )}

              </div>

            </>

          )}

        </section>

      </div>

    </Card>

  )

}



const styles: Record<string, CSSProperties> = {

  helpBanner: {

    margin: 0,

    padding: '12px 16px',

    fontSize: 13,

    lineHeight: 1.45,

    color: theme.colors.textSecondary,

    background: theme.colors.muted,

    borderBottom: `1px solid ${theme.colors.border}`,

  },

  wrap: {

    display: 'grid',

    gridTemplateColumns: 'minmax(240px, 300px) 1fr',

    gap: 0,

    minHeight: 480,

  },

  list: {

    borderInlineEnd: `1px solid ${theme.colors.border}`,

    overflow: 'auto',

    maxHeight: 560,

    background: theme.colors.surface,

  },

  listItem: {

    display: 'block',

    width: '100%',

    textAlign: 'right',

    padding: '12px 14px',

    border: 'none',

    borderBottom: `1px solid ${theme.colors.border}`,

    background: theme.colors.surface,

    cursor: 'pointer',

  },

  listItemActive: { background: theme.colors.muted },

  listTitle: { fontWeight: 600, fontSize: 14, color: theme.colors.textPrimary },

  listPreview: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },

  thread: {

    display: 'flex',

    flexDirection: 'column',

    minHeight: 480,

    background: theme.colors.surface,

  },

  emptyThread: { padding: 32, textAlign: 'center' },

  emptyTitle: { fontSize: 16, fontWeight: 600, color: theme.colors.textPrimary, margin: '0 0 8px' },

  threadHeader: {

    padding: '12px 16px',

    borderBottom: `1px solid ${theme.colors.border}`,

    fontWeight: 600,

    display: 'flex',

    flexWrap: 'wrap',

    gap: 8,

    alignItems: 'center',

    justifyContent: 'space-between',

  },

  badgeOpen: {

    fontSize: 11,

    fontWeight: 600,

    color: theme.colors.success,

    background: theme.colors.successMuted,

    padding: '3px 10px',

    borderRadius: 999,

  },

  badgeClosed: {

    fontSize: 11,

    fontWeight: 600,

    color: theme.colors.warning,

    background: theme.colors.warningMuted,

    padding: '3px 10px',

    borderRadius: 999,

  },

  messages: { flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 },

  bubble: { maxWidth: '85%', padding: '10px 12px', borderRadius: 12, fontSize: 14, lineHeight: 1.45 },

  bubbleIn: { alignSelf: 'flex-start', background: theme.colors.muted, color: theme.colors.textPrimary },

  bubbleOut: { alignSelf: 'flex-end', background: '#dcf8c6', color: theme.colors.textPrimary },

  time: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4 },

  compose: {

    padding: 14,

    borderTop: `1px solid ${theme.colors.border}`,

    display: 'flex',

    flexDirection: 'column',

    gap: 10,

    background: theme.colors.muted,

  },

  composeLabel: { fontSize: 13, fontWeight: 600, color: theme.colors.textSecondary, display: 'block', marginBottom: 4 },

  closedHint: {

    margin: 0,

    fontSize: 13,

    lineHeight: 1.45,

    color: theme.colors.textSecondary,

  },

  quickActions: { display: 'flex', flexDirection: 'column', gap: 8 },

  quickActionsTitle: { fontSize: 13, fontWeight: 700, color: theme.colors.textPrimary },

  quickGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 },

  quickBtn: {

    display: 'flex',

    flexDirection: 'column',

    alignItems: 'flex-start',

    gap: 4,

    padding: '12px 14px',

    borderRadius: theme.radius.md,

    border: `1px solid ${theme.colors.border}`,

    background: theme.colors.surface,

    cursor: 'pointer',

    textAlign: 'right',

  },

  quickBtnActive: {

    borderColor: theme.colors.primary,

    background: theme.colors.primaryMuted,

  },

  quickBtnDisabled: {

    opacity: 0.5,

    cursor: 'not-allowed',

  },

  quickBtnTitle: { fontSize: 14, fontWeight: 700, color: theme.colors.textPrimary },

  quickBtnHint: { fontSize: 11, color: theme.colors.textMuted, lineHeight: 1.35 },

  quickPanel: {

    display: 'flex',

    flexDirection: 'column',

    gap: 10,

    padding: '12px 14px',

    borderRadius: theme.radius.md,

    background: theme.colors.surface,

    border: `1px solid ${theme.colors.borderSubtle}`,

  },

  input: {

    width: '100%',

    padding: '10px 12px',

    borderRadius: theme.radius.md,

    border: `1px solid ${theme.colors.border}`,

    fontFamily: 'inherit',

    fontSize: 14,

    boxSizing: 'border-box',

  },

  previewBox: {

    padding: '10px 12px',

    borderRadius: theme.radius.md,

    background: theme.colors.muted,

    border: `1px solid ${theme.colors.borderSubtle}`,

  },

  previewLabel: { fontSize: 11, fontWeight: 600, color: theme.colors.textMuted, marginBottom: 6 },

  previewText: { fontSize: 13, lineHeight: 1.45, color: theme.colors.textPrimary, whiteSpace: 'pre-wrap' },

  textarea: {

    width: '100%',

    resize: 'vertical',

    padding: '10px 12px',

    borderRadius: theme.radius.md,

    border: `1px solid ${theme.colors.border}`,

    fontFamily: 'inherit',

    fontSize: 15,

    boxSizing: 'border-box',

  },

  muted: { padding: 16, color: theme.colors.textMuted, margin: 0, fontSize: 13 },

}


