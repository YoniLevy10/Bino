'use client'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { isFetchTimeoutError } from '@/lib/shared/fetch-with-timeout'
import { whatsappUiMutate } from '@/lib/whatsapp/whatsapp-ui-fetch'
import { toast } from '@/lib/errors/error-handler'
import {
  buildInboxTemplatePreview,
  inboxTemplateRequiresOpenTicket,
  listInboxReadyTemplates,
  listInboxUiTemplates,
  type InboxMetaTemplate,
} from '@/lib/whatsapp/whatsapp-inbox-meta-templates'
import {
  inboxTemplateParamsFromContext,
  managerReplyTemplateParams,
  residentFirstNameForTemplate,
  type WhatsAppInboxContext,
} from '@/lib/whatsapp/whatsapp-inbox-context'
import {
  useWhatsAppInboxV2Conversations,
  useWhatsAppInboxMessages,
  useWhatsAppThreadMeta,
  sendWhatsAppInboxMedia,
} from '@/lib/whatsapp/whatsapp-inbox-hooks'
import { conversationHasUnread, markConversationRead } from '@/lib/whatsapp/whatsapp-inbox-unread-local'
import { WhatsAppInboxFilters } from './WhatsAppInboxFilters'
import { WhatsAppInboxMessageMedia } from './WhatsAppInboxMessageMedia'
import { WhatsAppStartChatFab } from './WhatsAppStartChatFab'
import { WhatsAppInboxForwardPro } from './WhatsAppInboxForwardPro'
import { queryKeys } from '@/lib/shared/query-keys'
import { getIsMobileViewport } from '@/lib/shared/mobile-viewport'
import { useChatSheetScrollLock, useVisualViewportFrame } from '@/lib/hooks/use-visual-viewport-frame'
import { useAppRefreshListener } from '@/lib/hooks/use-app-refresh'
import { Button, Card, theme, useMobileMenuOptional } from '../ui'
import {
  residentLabel,
  waInitials,
  waAvatarColor,
  waClock,
  waListTime,
  waDayLabel,
  displayPhone,
  formatInboxMessageBody,
  type WhatsAppInboxConversation as Conversation,
  type WhatsAppInboxMessage as Message,
} from './whatsapp-inbox-helpers'
import {
  WaBackIcon,
  WaSendIcon,
  WaPlusIcon,
  WaSearchIcon,
  WaAttachIcon,
  WaMenuIcon,
  WaMark,
} from './WhatsAppInboxIcons'
import { styles } from './whatsapp-inbox-styles'

type InboxConversation = Conversation & {
  building_name?: string | null
  last_inbound_at?: string | null
  has_open_ticket?: boolean
}

type InboxTemplateOption = {
  id: string
  label: string
  description: string
  params: { key: string; label: string; placeholder: string; maxLength: number }[]
  preview: string
}

export function WhatsAppInboxPanel() {
  const queryClient = useQueryClient()
  const mobileMenu = useMobileMenuOptional()
  const {
    inboxV2,
    conversations,
    isLoading: conversationsLoading,
    error: conversationsError,
    invalidate: invalidateConversations,
    refetch: refetchConversations,
    hasData: conversationsHasData,
    filters: inboxFilters,
    setFilters: setInboxFilters,
    buildingOptions,
  } = useWhatsAppInboxV2Conversations()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const messagesQuery = useWhatsAppInboxMessages(selectedId)
  const metaQuery = useWhatsAppThreadMeta(selectedId)
  const messages = (messagesQuery.data ?? []) as Message[]
  const [sessionClosedLocally, setSessionClosedLocally] = useState(false)
  const inSession = sessionClosedLocally
    ? false
    : metaQuery.isError
      ? false
      : (metaQuery.data?.inSession ?? true)
  const inboxContext = metaQuery.data?.context ?? null
  const templates = useMemo(() => listInboxUiTemplates(), [])
  const sessionLoading = Boolean(selectedId) && metaQuery.isLoading && !metaQuery.data
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
  const [listQuery, setListQuery] = useState('')
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [activeQuickAction, setActiveQuickAction] = useState<string | null>(null)
  const [templateParams, setTemplateParams] = useState<string[]>([])
  const [startChatOpen, setStartChatOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => getIsMobileViewport())
  const [portalReady, setPortalReady] = useState(false)
  const [attachBusy, setAttachBusy] = useState(false)
  const attachInputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesScrollRef = useRef<HTMLDivElement>(null)

  const selected = (conversations as Conversation[]).find((c) => c.id === selectedId) ?? null
  const filteredConversations = useMemo(() => {
    const rows = conversations as Conversation[]
    const q = listQuery.trim()
    if (!q) return rows
    return rows.filter((c) => {
      const label = residentLabel(c)
      const preview = c.last_message_preview ?? ''
      return label.includes(q) || c.phone.includes(q) || preview.includes(q)
    })
  }, [conversations, listQuery])
  const mobilePane = selectedId ? 'thread' : 'list'
  const activeTemplate = templates.find((t) => t.id === activeQuickAction) ?? null
  const readyTemplates = listInboxReadyTemplates(templates)
  const loading = conversationsLoading && !conversationsHasData
  const useMobileThreadPortal = isMobile && Boolean(selectedId)
  const portalFrame = useVisualViewportFrame(useMobileThreadPortal)
  useChatSheetScrollLock(useMobileThreadPortal)

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
        void queryClient.invalidateQueries({ queryKey: queryKeys.whatsappThreadMeta(selectedId) })
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

  useEffect(() => {
    const keyboardOpen = useMobileThreadPortal && Boolean(portalFrame?.keyboardOpen)
    if (!keyboardOpen) return
    document.body.classList.add('wa-keyboard-open')
    return () => document.body.classList.remove('wa-keyboard-open')
  }, [useMobileThreadPortal, portalFrame?.keyboardOpen])

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
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.whatsappMessages(conversationId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.whatsappThreadMeta(conversationId) }),
    ])
  }, [queryClient])
  const refreshMessagesRef = useRef(refreshMessages)
  const refreshConversationsRef = useRef(refreshConversations)
  refreshMessagesRef.current = refreshMessages
  refreshConversationsRef.current = refreshConversations

  useEffect(() => {
    setSessionClosedLocally(false)
    setActiveQuickAction(null)
    setTemplateParams([])
    setTemplatesOpen(false)
    if (selectedId && inboxV2) {
      markConversationRead(selectedId)
    }
  }, [selectedId, inboxV2])

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
      void queryClient.invalidateQueries({ queryKey: queryKeys.whatsappThreadMeta(selectedId) })
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
        toast.success('נשלחה תבנית עם ההודעה שכתבתם — אחרי אישור אפשר לכתוב חופשי')
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
          toast.success('נשלחה תבנית עם ההודעה שכתבתם')
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

  async function sendAttachment(file: File) {
    if (!selected || !inboxV2 || attachBusy) return
    const allowed = file.type.startsWith('image/') || file.type === 'application/pdf'
    if (!allowed) {
      toast.error('רק תמונה או PDF')
      return
    }
    setAttachBusy(true)
    try {
      await sendWhatsAppInboxMedia(selected.phone, selected.id, file, reply.trim() || undefined)
      setReply('')
      toast.success('הקובץ נשלח')
      await refreshMessages(selected.id)
      await refreshConversations()
    } catch (e) {
      const err = e as Error & { code?: string }
      if (err.code === 'WA_SESSION_EXPIRED') {
        setSessionClosedLocally(true)
      }
      toast.error(err instanceof Error ? err.message : 'שליחת קובץ נכשלה')
    } finally {
      setAttachBusy(false)
      if (attachInputRef.current) attachInputRef.current.value = ''
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
      <div style={styles.emptyMark} aria-hidden>
        <WaMark />
      </div>
      <p style={styles.emptyTitle}>בחרו שיחה</p>
      <p style={styles.emptyHint}>ההודעות עם הדייר יופיעו כאן, כמו בוואטסאפ.</p>
    </div>
  ) : (
    <>
      <div className="wa-inbox-thread-header" style={styles.threadHeader}>
        <button
          type="button"
          className="wa-inbox-back"
          style={styles.backBtn}
          onClick={() => setSelectedId(null)}
          aria-label="חזרה לרשימת שיחות"
        >
          <WaBackIcon />
        </button>
        <span
          style={{ ...styles.avatar, ...styles.threadAvatar, background: waAvatarColor(selected.id) }}
          aria-hidden
        >
          {waInitials(residentLabel(selected))}
        </span>
        <span style={styles.threadIdentity}>
          <span style={styles.threadTitle}>{residentLabel(selected)}</span>
          <span style={styles.threadMetaRow}>
            <span style={styles.threadSub}>{displayPhone(selected.phone)}</span>
            {!sessionLoading ? (
              <span
                style={{
                  ...styles.sessionChip,
                  ...(inSession ? styles.sessionChipOpen : styles.sessionChipClosed),
                }}
              >
                {inSession ? 'אפשר לכתוב' : 'חלון 24 שעות סגור'}
              </span>
            ) : null}
          </span>
        </span>
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
          <p style={styles.dayChip}>אין הודעות בשיחה עדיין</p>
        ) : (
          messages.map((m, index) => {
            const day = waDayLabel(m.created_at)
            const prev = index > 0 ? messages[index - 1] : null
            const showDay = !prev || waDayLabel(prev.created_at) !== day
            const outgoing = m.direction === 'out'
            return (
              <div key={m.id} style={styles.messageBlock}>
                {showDay ? <div style={styles.dayChip}>{day}</div> : null}
                <div
                  style={{
                    ...styles.bubbleRow,
                    ...(outgoing ? styles.bubbleRowOut : styles.bubbleRowIn),
                  }}
                >
                  <div style={{ ...styles.bubble, ...(outgoing ? styles.bubbleOut : styles.bubbleIn) }}>
                    {inboxV2 ? (
                      <WhatsAppInboxMessageMedia
                        message={m}
                        fallbackText={formatInboxMessageBody(m)}
                      />
                    ) : (
                      <span style={styles.bubbleText}>{formatInboxMessageBody(m)}</span>
                    )}
                    {inboxV2 && m.body?.trim() && (m.message_type === 'image' || m.message_type === 'document') ? (
                      <span style={styles.bubbleText}>{m.body}</span>
                    ) : null}
                    <span style={styles.time}>{waClock(m.created_at)}</span>
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
      <div className="wa-inbox-compose" style={styles.compose}>
        {!inSession && (
          <p style={styles.templateComposeHint}>
            תישלח תבנית עם ההודעה שכתבתם — אחרי «קיבלתי» או תשובה אפשר לכתוב חופשי.
          </p>
        )}
        {!inSession && reply.trim() && hasManagerReplyTemplate && (
          <div style={styles.previewBox}>
            <div style={styles.previewLabel}>כך תיראה ההודעה</div>
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
        {!inSession && !hasManagerReplyTemplate && (
          <p style={styles.closedHint}>אפשר לשלוח רק הודעה מוכנה מהרשימה.</p>
        )}
        {!inSession && templatesOpen && readyTemplates.length > 0 && (
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
        {inboxV2 && inboxContext?.open_ticket ? (
          <WhatsAppInboxForwardPro
            ticketId={inboxContext.open_ticket.id}
            ticketNumber={inboxContext.open_ticket.ticket_number}
          />
        ) : null}
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
        <div style={styles.composeRow}>
          {inboxV2 ? (
            <>
              <input
                ref={attachInputRef}
                type="file"
                accept="image/*,application/pdf"
                style={styles.hiddenFile}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void sendAttachment(file)
                }}
              />
              <button
                type="button"
                style={{
                  ...styles.iconBtn,
                  ...((attachBusy || !inSession) ? styles.iconBtnDisabled : {}),
                }}
                disabled={attachBusy || !inSession}
                aria-label="צירוף תמונה או PDF"
                onClick={() => attachInputRef.current?.click()}
              >
                <WaAttachIcon />
              </button>
            </>
          ) : null}
          {!inSession && readyTemplates.length > 0 ? (
            <button
              type="button"
              style={{
                ...styles.iconBtn,
                ...(templatesOpen ? styles.iconBtnActive : {}),
              }}
              aria-expanded={templatesOpen}
              aria-label="הודעות מוכנות"
              onClick={() => setTemplatesOpen((open) => !open)}
            >
              <WaPlusIcon />
            </button>
          ) : null}
          <label htmlFor="wa-reply" style={styles.srOnly}>
            הודעה לדייר/ה
          </label>
          <textarea
            id="wa-reply"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !isMobile) {
                e.preventDefault()
                void sendReply()
              }
            }}
            rows={1}
            placeholder="הודעה"
            style={styles.textarea}
            maxLength={500}
          />
          <button
            type="button"
            style={{
              ...styles.sendBtn,
              ...((sending || sessionLoading || !reply.trim()) ? styles.sendBtnDisabled : {}),
            }}
            aria-label={inSession ? 'שלח הודעה' : 'שלח דרך תבנית'}
            disabled={sending || sessionLoading || !reply.trim()}
            onClick={() => void sendReply()}
          >
            {sending ? <span style={styles.sendWait}>…</span> : <WaSendIcon />}
          </button>
        </div>
      </div>
    </>
  )

  return (
    <div className="wa-app">
    <Card noPadding style={{ overflow: 'hidden', background: '#fff', border: '1px solid #e9edef' }}>
      <div className="wa-inbox-wrap" data-mobile-pane={mobilePane}>
        <aside
          className="wa-inbox-list"
          style={styles.list}
          aria-label="רשימת שיחות"
        >
          <div style={styles.listHeader}>
            <div style={styles.listHeaderTop}>
              {isMobile && mobileMenu ? (
                <button
                  type="button"
                  style={styles.iconBtn}
                  aria-label="פתיחת תפריט"
                  aria-expanded={mobileMenu.isOpen}
                  onClick={mobileMenu.openMenu}
                >
                  <WaMenuIcon />
                </button>
              ) : null}
              <div style={styles.listHeaderTitle}>שיחות</div>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                style={styles.newChatHeaderBtn}
                aria-label="שיחה חדשה עם דייר"
                onClick={() => setStartChatOpen(true)}
              >
                <span aria-hidden style={{ fontSize: 22, lineHeight: 1, marginTop: -2 }}>
                  +
                </span>
              </button>
            </div>
            <label style={styles.searchWrap}>
              <span style={styles.srOnly}>חיפוש שיחה</span>
              <WaSearchIcon />
              <input
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
                placeholder="חפשו או התחילו שיחה"
                style={styles.searchInput}
              />
            </label>
            {inboxV2 ? (
              <WhatsAppInboxFilters
                filters={inboxFilters}
                buildingOptions={buildingOptions}
                onChange={setInboxFilters}
              />
            ) : null}
          </div>
          <WhatsAppStartChatFab
            buildingId={inboxFilters.buildingId}
            forceOpen={startChatOpen}
            onOpenChange={setStartChatOpen}
            onStarted={(id) => {
              setSelectedId(id)
              setStartChatOpen(false)
              void invalidateConversations()
            }}
          />
          {loading ? (
            <p style={styles.muted}>טוען שיחות…</p>
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
            <p style={styles.muted}>עדיין אין שיחות. כשדייר יכתוב, השיחה תופיע כאן.</p>
          ) : filteredConversations.length === 0 ? (
            <p style={styles.muted}>אין שיחות שמתאימות לחיפוש.</p>
          ) : (
            filteredConversations.map((c) => {
              const row = c as InboxConversation
              const label = residentLabel(c)
              const active = selectedId === c.id
              const unread =
                inboxV2 && conversationHasUnread(c.id, row.last_inbound_at ?? null)
              return (
                <button
                  key={c.id}
                  type="button"
                  style={{
                    ...styles.listItem,
                    ...(active ? styles.listItemActive : {}),
                  }}
                  onClick={() => setSelectedId(c.id)}
                  aria-pressed={active}
                >
                  <span style={{ ...styles.avatar, background: waAvatarColor(c.id) }} aria-hidden>
                    {waInitials(label)}
                  </span>
                  <span style={styles.listBody}>
                    <span style={styles.listTop}>
                      <span style={styles.listTitle}>
                        {label}
                        {unread ? <span style={styles.unreadDot} aria-label="לא נקרא" /> : null}
                      </span>
                      <span style={styles.listTime}>{waListTime(c.last_message_at)}</span>
                    </span>
                    <span style={styles.listPreview}>
                      {inboxV2 && row.building_name ? `${row.building_name} · ` : ''}
                      {c.last_message_preview || '—'}
                    </span>
                  </span>
                </button>
              )
            })
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
            <div
              className="wa-inbox-portal-overlay"
              role="dialog"
              aria-modal="true"
              aria-label="שיחת WhatsApp"
              data-keyboard={portalFrame?.keyboardOpen ? 'open' : 'closed'}
              style={
                portalFrame
                  ? {
                      top: portalFrame.top,
                      height: portalFrame.keyboardOpen
                        ? portalFrame.height
                        : `calc(${portalFrame.height}px - var(--mobile-bottom-nav-height, 80px) - env(safe-area-inset-bottom, 0px))`,
                      bottom: 'auto',
                    }
                  : {
                      bottom:
                        'calc(var(--mobile-bottom-nav-height, 80px) + env(safe-area-inset-bottom, 0px))',
                    }
              }
            >
              <section className="wa-inbox-thread wa-inbox-thread-portal" style={styles.threadPortal} aria-label="שיחה">
                {threadBody}
              </section>
            </div>,
            document.body
          )
        : null}
    </Card>
    </div>
  )
}
