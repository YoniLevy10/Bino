'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isFetchTimeoutError } from '@/lib/fetch-with-timeout'
import { whatsappUiMutate } from '@/lib/whatsapp-ui-fetch'
import { toast } from '@/lib/error-handler'
import { formatWhatsAppInboxDisplayLabel } from '@/lib/whatsapp-inbox-display'
import {
  buildInboxTemplatePreview,
  inboxTemplateRequiresOpenTicket,
  listInboxReadyTemplates,
  listInboxUiTemplates,
  type InboxMetaTemplate,
} from '@/lib/whatsapp-inbox-meta-templates'
import {
  inboxTemplateParamsFromContext,
  managerReplyTemplateParams,
  residentFirstNameForTemplate,
  type WhatsAppInboxContext,
} from '@/lib/whatsapp-inbox-context'
import {
  useWhatsAppConversations,
  useWhatsAppMessages,
} from '@/lib/hooks/use-whatsapp-conversations'
import { queryKeys } from '@/lib/query-keys'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { useAppRefreshListener } from '@/lib/hooks/use-app-refresh'
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
  message_type?: string | null
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

function formatInboxMessageBody(m: Message): string {
  const text = m.body?.trim()
  if (text) return text
  switch (m.message_type) {
    case 'image':
      return 'תמונה'
    case 'video':
      return 'וידאו'
    case 'audio':
      return 'הודעה קולית'
    case 'document':
      return 'מסמך'
    case 'interactive':
      return 'הודעה אינטראקטיבית'
    case 'template':
      return 'תבנית Meta'
    case 'reaction':
      return 'תגובה'
    case 'sticker':
      return 'מדבקה'
    case 'location':
      return 'מיקום'
    case 'unsupported':
      return 'הודעה לא נתמכת'
    default:
      return '—'
  }
}

export function WhatsAppInboxPanel() {
  const queryClient = useQueryClient()
  const {
    conversations,
    isLoading: conversationsLoading,
    error: conversationsError,
    invalidate: invalidateConversations,
    refetch: refetchConversations,
    hasData: conversationsHasData,
  } = useWhatsAppConversations()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const messagesQuery = useWhatsAppMessages(selectedId)
  const messages = (messagesQuery.data?.messages ?? []) as Message[]
  const [sessionClosedLocally, setSessionClosedLocally] = useState(false)
  const inSession = sessionClosedLocally ? false : (messagesQuery.data?.inSession ?? true)
  const inboxContext = messagesQuery.data?.context ?? null
  const templates = useMemo(() => listInboxUiTemplates(), [])
  const sessionLoading = Boolean(selectedId) && messagesQuery.isLoading && !messagesQuery.data
  const contextLoading = sessionLoading
  // Only the initial in-flight load — not background isFetching (avoids eternal "טוען").
  const messagesLoading =
    Boolean(selectedId) &&
    messages.length === 0 &&
    messagesQuery.isLoading &&
    !messagesQuery.isError
  const [messagesLoadTimedOut, setMessagesLoadTimedOut] = useState(false)
  const messagesError =
    messages.length === 0 &&
    (messagesQuery.isError || messagesLoadTimedOut)
      ? messagesQuery.isError && isFetchTimeoutError(messagesQuery.error)
        ? 'השיחה נטענת לאט. נסו שוב.'
        : messagesQuery.isError && messagesQuery.error instanceof Error
          ? messagesQuery.error.message
          : 'טעינת הודעות נכשלה — נסו שוב'
      : null

  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [activeQuickAction, setActiveQuickAction] = useState<string | null>(null)
  const [templateParams, setTemplateParams] = useState<string[]>([])
  const [isMobile, setIsMobile] = useState(() => getIsMobileViewport())
  const [portalReady, setPortalReady] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesScrollRef = useRef<HTMLDivElement>(null)

  const selected = (conversations as Conversation[]).find((c) => c.id === selectedId) ?? null
  const mobilePane = selectedId ? 'thread' : 'list'
  const activeTemplate = templates.find((t) => t.id === activeQuickAction) ?? null
  const readyTemplates = listInboxReadyTemplates(templates)
  const loading = conversationsLoading && !conversationsHasData
  const useMobileThreadPortal = isMobile && Boolean(selectedId)

  useEffect(() => {
    setPortalReady(true)
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useAppRefreshListener(
    useCallback(() => {
      void invalidateConversations()
      if (selectedId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.whatsappMessages(selectedId) })
      }
    }, [invalidateConversations, queryClient, selectedId])
  )

  useEffect(() => {
    if (!useMobileThreadPortal) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [useMobileThreadPortal])

  // Belt-and-suspenders: if the request never settles (iOS timer throttle / hung fetch),
  // leave the infinite "טוען הודעות…" state and offer retry.
  useEffect(() => {
    if (!selectedId || !messagesLoading) {
      setMessagesLoadTimedOut(false)
      return
    }
    const t = window.setTimeout(() => setMessagesLoadTimedOut(true), 50_000)
    return () => window.clearTimeout(t)
  }, [selectedId, messagesLoading])

  const refreshConversations = useCallback(async () => {
    await invalidateConversations()
  }, [invalidateConversations])

  const refreshMessages = useCallback(async (conversationId: string) => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.whatsappMessages(conversationId) })
  }, [queryClient])
  const refreshMessagesRef = useRef(refreshMessages)
  const refreshConversationsRef = useRef(refreshConversations)
  refreshMessagesRef.current = refreshMessages
  refreshConversationsRef.current = refreshConversations

  useEffect(() => {
    setSessionClosedLocally(false)
    setActiveQuickAction(null)
    setTemplateParams([])
  }, [selectedId])

  useEffect(() => {
    if (!selectedId) return

    const channel = supabase
      .channel(`wa-inbox:${selectedId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'whatsapp_messages', filter: `conversation_id=eq.${selectedId}` },
        () => {
          void refreshMessagesRef.current(selectedId)
          void refreshConversationsRef.current()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [selectedId])

  useEffect(() => {
    // Scroll inside the messages pane only — window scrollIntoView breaks iOS portal layout.
    const pane = messagesScrollRef.current
    if (!pane) return
    pane.scrollTop = pane.scrollHeight
  }, [messages.length, selectedId])

  useEffect(() => {
    if (!selectedId) return
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      void queryClient.invalidateQueries({ queryKey: queryKeys.whatsappMessages(selectedId) })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [queryClient, selectedId])

  function pickQuickAction(templateId: string) {
    const tpl = templates.find((t) => t.id === templateId)
    const paramCount = tpl?.params.length ?? 0
    if (!inboxContext) {
      setActiveQuickAction(templateId)
      setTemplateParams(Array.from({ length: paramCount }, () => ''))
      return
    }
    setActiveQuickAction(templateId)
    setTemplateParams(inboxTemplateParamsFromContext(templateId, inboxContext, paramCount))
  }

  function missingParamIndices(template: InboxTemplateOption, params: string[]): number[] {
    return template.params
      .map((_, i) => i)
      .filter((i) => !params[i]?.trim())
  }

  const hasManagerReplyTemplate = templates.some((t) => t.id === 'manager_reply')

  function managerReplyContext(): WhatsAppInboxContext {
    if (inboxContext) return inboxContext

    const r = selected
      ? Array.isArray(selected.residents)
        ? selected.residents[0]
        : selected.residents
      : null
    return {
      resident_name: residentFirstNameForTemplate(r?.full_name),
      building_name: null,
      open_ticket: null,
      recent_closed_ticket: null,
    }
  }

  async function sendReply() {
    if (!selected || !reply.trim() || sending) return
    setSending(true)
    try {
      if (!inSession) {

        const res = await whatsappUiMutate('/api/whatsapp/send-template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: selected.phone,
            template_id: 'manager_reply',
            params: managerReplyTemplateParams(managerReplyContext(), reply.trim()),
            conversation_id: selected.id,
          }),
        })

        const json = (await res.json()) as { error?: string }
        if (!res.ok) throw new Error(json.error || 'שליחה נכשלה')
        toast.success('ההודעה נשלחה לדייר/ה — כשיגיב/תגיב אפשר לכתוב חופשי')
        setReply('')
        await refreshMessages(selected.id)
        await refreshConversations()
        return
      }

      const res = await whatsappUiMutate('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: selected.phone, body: reply.trim(), conversation_id: selected.id }),
      })

      const json = (await res.json()) as { error?: string; code?: string }
      if (!res.ok) {
        if (json.code === 'WA_SESSION_EXPIRED') {
          setSessionClosedLocally(true)

          const tplRes = await whatsappUiMutate('/api/whatsapp/send-template', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: selected.phone,
              template_id: 'manager_reply',
              params: managerReplyTemplateParams(managerReplyContext(), reply.trim()),
              conversation_id: selected.id,
            }),
          })

          const tplJson = (await tplRes.json()) as { error?: string }
          if (!tplRes.ok) throw new Error(tplJson.error || 'שליחה דרך תבנית נכשלה')
          toast.success('ההודעה נשלחה דרך תבנית Meta')
          setReply('')
          await refreshMessages(selected.id)
          await refreshConversations()
          return
        }
        throw new Error(json.error || 'שליחה נכשלה')
      }
      setReply('')
      await refreshMessages(selected.id)
      await refreshConversations()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שליחה נכשלה')
    } finally {
      setSending(false)
    }
  }

  async function sendQuickAction() {
    if (!selected || !activeQuickAction || !activeTemplate || sending) return
    if (missingParamIndices(activeTemplate, templateParams).length > 0) {
      toast.error('חסר מידע — מלאו את השדה הריק')
      return
    }
    setSending(true)
    try {

      const res = await whatsappUiMutate('/api/whatsapp/send-template', {
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
      await refreshMessages(selected.id)
      await refreshConversations()
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

  const threadBody: ReactNode = !selected ? (
    <div style={styles.emptyThread}>
      <p style={styles.emptyTitle}>→ בחרו דייר/ה מהרשימה</p>
      <p style={styles.muted}>המערכת מזהה את הטלפון אוטומטית.</p>
    </div>
  ) : (
    <>
      <div style={styles.threadHeader}>
        <button
          type="button"
          className="wa-inbox-back"
          style={styles.backBtn}
          onClick={() => setSelectedId(null)}
          aria-label="חזרה לרשימת דיירים"
        >
          → רשימה
        </button>
        <span style={styles.threadTitle}>{residentLabel(selected)}</span>
        {!sessionLoading && (
          <span style={inSession ? styles.badgeOpen : styles.badgeClosed}>
            {inSession ? 'אפשר לכתוב חופשי' : 'שליחה דרך תבנית Meta'}
          </span>
        )}
      </div>
      <div
        ref={messagesScrollRef}
        className="wa-inbox-messages"
        style={styles.messages}
        role="log"
        aria-live="polite"
      >
        {messagesLoading && !messagesError ? (
          <p style={styles.muted}>טוען הודעות…</p>
        ) : messagesError ? (
          <div style={styles.messagesErrorBox}>
            <p style={styles.messagesErrorText}>{messagesError}</p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setMessagesLoadTimedOut(false)
                void messagesQuery.refetch()
              }}
              style={{ alignSelf: 'flex-start' }}
            >
              נסו שוב
            </Button>
          </div>
        ) : messages.length === 0 ? (
          <p style={styles.muted}>אין הודעות בשיחה עדיין.</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              style={{
                ...styles.bubble,
                ...(m.direction === 'out' ? styles.bubbleOut : styles.bubbleIn),
              }}
            >
              {formatInboxMessageBody(m)}
              <div style={styles.time}>
                {new Date(m.created_at).toLocaleString('he-IL', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <div className="wa-inbox-compose" style={styles.compose}>
        <label htmlFor="wa-reply" style={styles.composeLabel}>
          הודעה לדייר/ה
        </label>
        {!inSession && (
          <p style={styles.templateComposeHint}>
            חלון 24 שעות סגור — ההודעה תישלח דרך תבנית Meta. כשהדייר/ה יגיב/תגיב, אפשר לכתוב חופשי.
          </p>
        )}
        <textarea
          id="wa-reply"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={2}
          placeholder="כתבו כאן…"
          style={styles.textarea}
          maxLength={500}
        />
        {!inSession && reply.trim() && hasManagerReplyTemplate && (
          <div style={styles.previewBox}>
            <div style={styles.previewLabel}>כך תיראה ההודעה:</div>
            <div style={styles.previewText}>
              {buildInboxTemplatePreview(
                {
                  id: 'manager_reply',
                  label: 'הודעה מהמשרד',
                  description: '',
                  language: 'he',
                  resolveMetaName: () => 'manager_reply',
                  preview: '',
                  params: [],
                },
                managerReplyTemplateParams(managerReplyContext(), reply)
              )}
            </div>
          </div>
        )}
        <Button onClick={() => void sendReply()} disabled={sending || sessionLoading || !reply.trim()}>
          {sending ? 'שולח…' : inSession ? 'שלח הודעה' : 'שלח דרך תבנית Meta'}
        </Button>
        {!inSession && !hasManagerReplyTemplate && (
          <p style={styles.closedHint}>
            הדייר/ה לא כתב/ה לאחרונה — אפשר לשלוח רק הודעה מוכנה מהרשימה:
          </p>
        )}
        {!inSession && readyTemplates.length > 0 && (
          <div style={styles.quickActions}>
            <div style={styles.quickActionsTitle}>הודעות מוכנות</div>
            <div style={styles.quickGrid}>
              {readyTemplates.map((tpl) => {
                  const isActive = activeQuickAction === tpl.id
                  const needsOpenTicket = inboxTemplateRequiresOpenTicket(tpl.id)
                  const disabled =
                    needsOpenTicket && (contextLoading || !inboxContext?.open_ticket)

                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      disabled={disabled}
                      style={{
                        ...styles.quickBtn,
                        ...(isActive ? styles.quickBtnActive : {}),
                        ...(disabled ? styles.quickBtnDisabled : {}),
                      }}
                      onClick={() => !disabled && pickQuickAction(tpl.id)}
                    >
                      <span style={styles.quickBtnTitle}>{tpl.label}</span>
                      <span style={styles.quickBtnHint}>
                        {disabled ? 'אין תקלה פתוחה לדייר/ה' : tpl.description}
                      </span>
                    </button>
                  )
                })}
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
                sending || missingParamIndices(activeTemplate, templateParams).length > 0
              }
            >
              {sending ? 'שולח…' : 'שלח לדייר/ה'}
            </Button>
          </div>
        )}
      </div>
    </>
  )

  return (
    <Card noPadding style={{ overflow: 'hidden' }}>
      {!useMobileThreadPortal ? (
        <p className="wa-inbox-help-banner" style={styles.helpBanner}>
          בחרו דייר/ה מהרשימה וכתבו הודעה — אין צורך להקליד מספר טלפון.
        </p>
      ) : null}
      <div className="wa-inbox-wrap" data-mobile-pane={mobilePane}>
        <aside className="wa-inbox-list" style={styles.list} aria-label="רשימת דיירים">
          {loading ? (
            <p style={styles.muted}>טוען…</p>
          ) : conversationsError && conversations.length === 0 ? (
            <div style={styles.messagesErrorBox}>
              <p style={styles.messagesErrorText}>
                {conversationsError instanceof Error
                  ? conversationsError.message
                  : 'לא הצלחנו לטעון את השיחות'}
              </p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void refetchConversations()}
                style={{ alignSelf: 'flex-start' }}
              >
                נסו שוב
              </Button>
            </div>
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
        {!useMobileThreadPortal ? (
          <section className="wa-inbox-thread" style={styles.thread} aria-label="שיחה">
            {threadBody}
          </section>
        ) : null}
      </div>
      {useMobileThreadPortal && portalReady
        ? createPortal(
            <div className="wa-inbox-portal-overlay" role="dialog" aria-modal="true" aria-label="שיחת WhatsApp">
              <section className="wa-inbox-thread wa-inbox-thread-portal" style={styles.threadPortal} aria-label="שיחה">
                {threadBody}
              </section>
            </div>,
            document.body
          )
        : null}
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
  list: {
    borderInlineEnd: `1px solid ${theme.colors.border}`,
    overflow: 'auto',
    minHeight: 0,
    height: '100%',
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
    minHeight: 0,
    height: '100%',
    overflow: 'hidden',
    background: theme.colors.surface,
  },
  threadPortal: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    width: '100%',
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
    flexShrink: 0,
    background: theme.colors.surface,
  },
  backBtn: {
    border: 'none',
    background: 'transparent',
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    padding: '4px 0',
    fontFamily: 'inherit',
    flexShrink: 0,
  },
  threadTitle: { flex: 1, minWidth: 0, textAlign: 'right' },
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
  messages: {
    flex: '1 1 0%',
    overflowY: 'auto',
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    minHeight: 0,
  },
  messagesErrorBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
    borderRadius: theme.radius.md,
    background: theme.colors.errorMuted,
  },
  messagesErrorText: {
    margin: 0,
    fontSize: 14,
    fontWeight: 600,
    color: theme.colors.error,
    lineHeight: 1.45,
  },
  bubble: { maxWidth: '85%', padding: '10px 12px', borderRadius: 12, fontSize: 14, lineHeight: 1.45, whiteSpace: 'pre-wrap' },
  bubbleIn: { alignSelf: 'flex-start', background: theme.colors.muted, color: theme.colors.textPrimary },
  bubbleOut: { alignSelf: 'flex-end', background: '#dcf8c6', color: theme.colors.textPrimary },
  time: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4 },
  compose: {
    padding: 14,
    borderTop: `1px solid ${theme.colors.border}`,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    flexShrink: 0,
    background: theme.colors.muted,
  },
  composeLabel: { fontSize: 13, fontWeight: 600, color: theme.colors.textSecondary, display: 'block', marginBottom: 4 },
  closedHint: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.45,
    color: theme.colors.textSecondary,
  },
  templateComposeHint: {
    margin: 0,
    fontSize: 12,
    lineHeight: 1.45,
    color: theme.colors.textMuted,
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
