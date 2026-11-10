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
  useWhatsAppThreadMeta,
} from '@/lib/hooks/use-whatsapp-conversations'
import { queryKeys } from '@/lib/query-keys'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { useChatSheetScrollLock, useVisualViewportFrame } from '@/lib/use-visual-viewport-frame'
import { formatPhoneLocalIl } from '@/lib/sales-leads/phone'
import { useAppRefreshListener } from '@/lib/hooks/use-app-refresh'
import { Button, Card, theme, useMobileMenuOptional } from '../ui'

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

const WA_AVATAR_COLORS = ['#00a884', '#53bdeb', '#7f66ff', '#e67e22', '#25d366', '#128c7e']

function residentLabel(c: Conversation): string {
  const r = Array.isArray(c.residents) ? c.residents[0] : c.residents
  return formatWhatsAppInboxDisplayLabel(c.phone, r)
}

function waInitials(label: string): string {
  const parts = label.replace(/[0-9+]/g, ' ').trim().split(/\s+/).filter((part) => part.length > 0)
  if (parts.length === 0) return 'ש'
  if (parts.length === 1) return parts[0].slice(0, 1)
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`
}

function waAvatarColor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return WA_AVATAR_COLORS[hash % WA_AVATAR_COLORS.length]
}

function waClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}

function waListTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return waClock(iso)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'אתמול'
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
}

function waDayLabel(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return 'היום'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return 'אתמול'
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'long' })
}

function displayPhone(phone: string): string {
  return formatPhoneLocalIl(phone) ?? phone
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
  const mobileMenu = useMobileMenuOptional()
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
  const [isMobile, setIsMobile] = useState(() => getIsMobileViewport())
  const [portalReady, setPortalReady] = useState(false)
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
        <span style={{ ...styles.avatar, background: waAvatarColor(selected.id) }} aria-hidden>
          {waInitials(residentLabel(selected))}
        </span>
        <span style={styles.threadIdentity}>
          <span style={styles.threadTitle}>{residentLabel(selected)}</span>
          <span style={styles.threadSub}>
            {displayPhone(selected.phone)}
            {!sessionLoading ? ` · ${inSession ? 'אפשר לכתוב' : 'חלון 24 שעות סגור'}` : ''}
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
                <div style={{ ...styles.bubble, ...(outgoing ? styles.bubbleOut : styles.bubbleIn) }}>
                  <span style={styles.bubbleText}>{formatInboxMessageBody(m)}</span>
                  <span style={styles.time}>{waClock(m.created_at)}</span>
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
            חלון 24 השעות סגור. ההודעה תישלח כתבנית, וכשהדייר יענה אפשר לכתוב חופשי.
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
        <aside className="wa-inbox-list" style={styles.list} aria-label="רשימת שיחות">
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
          </div>
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
              const label = residentLabel(c)
              const active = selectedId === c.id
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
                      <span style={styles.listTitle}>{label}</span>
                      <span style={styles.listTime}>{waListTime(c.last_message_at)}</span>
                    </span>
                    <span style={styles.listPreview}>{c.last_message_preview || '—'}</span>
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

function WaBackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

function WaSendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3.2 11.3 20.4 3.1c.7-.3 1.4.4 1.1 1.1l-8.2 17.2c-.3.7-1.3.6-1.5-.1l-1.8-6.4-6.4-1.8c-.7-.2-.8-1.2-.1-1.5Z" />
    </svg>
  )
}

function WaPlusIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function WaSearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#667781" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

function WaMenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  )
}

function WaMark() {
  return (
    <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="#8696a0" strokeWidth="1.2" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

const styles: Record<string, CSSProperties> = {
  helpBanner: {
    margin: 0,
    padding: '12px 16px',
    fontSize: 13,
    lineHeight: 1.45,
    color: theme.colors.textSecondary,
    background: theme.colors.mutedSurface,
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  list: {
    borderInlineEnd: '1px solid #e9edef',
    overflow: 'auto',
    minHeight: 0,
    height: '100%',
    background: '#fff',
  },
  listHeader: {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    padding: '10px 16px',
    paddingTop: 'calc(14px + env(safe-area-inset-top, 0px))',
    background: '#fff',
  },
  listHeaderTop: { display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 },
  listHeaderTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 700,
    color: '#111b21',
    letterSpacing: '-0.02em',
  },
  searchWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0 12px',
    minHeight: 36,
    borderRadius: 8,
    background: '#f0f2f5',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    border: 'none',
    outline: 'none',
    background: 'transparent',
    fontFamily: 'inherit',
    fontSize: 16,
    color: '#111b21',
    padding: '8px 0',
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    textAlign: 'right',
    padding: '10px 14px',
    border: 'none',
    borderBottom: '1px solid #f0f2f5',
    background: '#fff',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  listItemActive: { background: '#f0f2f5' },
  listBody: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 },
  listTop: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  listTitle: {
    fontWeight: 600,
    fontSize: 16,
    color: '#111b21',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  listTime: { flexShrink: 0, fontSize: 12, color: '#667781' },
  listPreview: {
    fontSize: 14,
    color: '#667781',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: 16,
    fontWeight: 700,
  },
  thread: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100%',
    overflow: 'hidden',
    background: '#efeae2',
  },
  threadPortal: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    width: '100%',
    background: '#efeae2',
  },
  emptyThread: {
    width: '100%',
    margin: 'auto',
    padding: '48px 20px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    boxSizing: 'border-box',
  },
  emptyMark: {
    width: 88,
    height: 88,
    borderRadius: '50%',
    background: '#f0f2f5',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: { fontSize: 20, fontWeight: 500, color: '#41525d', margin: 0, textAlign: 'center' },
  emptyHint: {
    margin: 0,
    maxWidth: 260,
    fontSize: 14,
    lineHeight: 1.45,
    color: '#667781',
    textAlign: 'center',
  },
  threadHeader: {
    padding: '8px 12px',
    minHeight: 60,
    borderBottom: '1px solid #e9edef',
    display: 'flex',
    flexWrap: 'nowrap',
    gap: 10,
    alignItems: 'center',
    flexShrink: 0,
    background: '#f0f2f5',
  },
  backBtn: {
    width: 44,
    height: 44,
    border: 'none',
    background: 'transparent',
    color: '#54656f',
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'inherit',
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  threadIdentity: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 },
  threadTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: '#111b21',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  threadSub: { fontSize: 12, color: '#667781', fontWeight: 400 },
  badgeOpen: {
    fontSize: 11,
    fontWeight: 600,
    color: theme.colors.success,
    background: theme.colors.successMuted,
    padding: '3px 10px',
    borderRadius: theme.radius.sm,
  },
  badgeClosed: {
    fontSize: 11,
    fontWeight: 600,
    color: theme.colors.warning,
    background: theme.colors.warningMuted,
    padding: '3px 10px',
    borderRadius: theme.radius.sm,
  },
  messages: {
    flex: '1 1 0%',
    overflowY: 'auto',
    padding: '12px 6%',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minHeight: 0,
  },
  messageBlock: { display: 'flex', flexDirection: 'column' },
  dayChip: {
    alignSelf: 'center',
    margin: '8px 0',
    padding: '5px 12px',
    borderRadius: 8,
    background: '#fff',
    color: '#54656f',
    fontSize: 12.5,
    boxShadow: '0 1px 0.5px rgba(11, 20, 26, 0.13)',
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
  bubble: {
    maxWidth: '78%',
    margin: '1px 0',
    padding: '6px 8px 4px 9px',
    borderRadius: 8,
    fontSize: 14.2,
    lineHeight: 1.35,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    columnGap: 8,
    boxShadow: '0 1px 0.5px rgba(11, 20, 26, 0.13)',
  },
  bubbleText: { whiteSpace: 'pre-wrap', minWidth: 0 },
  bubbleIn: {
    alignSelf: 'flex-start',
    background: '#fff',
    color: '#111b21',
    borderEndStartRadius: 2,
  },
  bubbleOut: {
    alignSelf: 'flex-end',
    background: '#d9fdd3',
    color: '#111b21',
    borderEndEndRadius: 2,
  },
  time: {
    marginInlineStart: 'auto',
    fontSize: 11,
    lineHeight: 1,
    color: '#667781',
    paddingBottom: 2,
    whiteSpace: 'nowrap',
  },
  compose: {
    padding: '6px 10px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    flexShrink: 0,
    background: '#f0f2f5',
  },
  composeRow: { display: 'flex', alignItems: 'flex-end', gap: 8 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: 'none',
    background: 'transparent',
    color: '#54656f',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },
  iconBtnActive: { background: '#fff', color: '#00a884' },
  srOnly: {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: '50%',
    border: 'none',
    background: '#00a884',
    color: '#fff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },
  sendBtnDisabled: { background: '#8696a0', cursor: 'default' },
  sendWait: { fontSize: 18, lineHeight: 1 },
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
    fontSize: 16,
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
    flex: 1,
    width: '100%',
    resize: 'none',
    minHeight: 42,
    maxHeight: 120,
    padding: '10px 12px',
    borderRadius: 8,
    border: 'none',
    background: '#fff',
    fontFamily: 'inherit',
    fontSize: 16,
    lineHeight: 1.35,
    color: '#111b21',
    boxSizing: 'border-box',
  },
  muted: { padding: 16, color: theme.colors.textMuted, margin: 0, fontSize: 13 },
}
