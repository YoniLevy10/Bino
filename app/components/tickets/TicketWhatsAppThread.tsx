'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { useChatSheetScrollLock, useVisualViewportFrame } from '@/lib/use-visual-viewport-frame'
import { whatsappUiFetch, whatsappUiMutate } from '@/lib/whatsapp-ui-fetch'
import { toast } from '@/lib/error-handler'
import { formatPhoneLocalIl } from '@/lib/sales-leads/phone'
import { Button, theme } from '../ui'
import {
  threadHasUnrecoveredMedia,
  unrecoveredMediaLabel,
  type TicketAttachmentSummary,
} from '@/lib/whatsapp-thread-media-status'

type Message = {
  id: string
  direction: 'in' | 'out'
  body: string | null
  message_type?: string | null
  interactive_payload?: Record<string, unknown> | null
  created_at: string
}

function waClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
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

function displayWhatsAppBody(m: Message): string {
  if (m.body?.trim()) return m.body
  if (m.message_type === 'image') return '📷 תמונה'
  if (m.message_type === 'video') return '🎬 וידאו'
  if (m.message_type === 'audio') return '🎵 הודעה קולית'
  return '—'
}

type Props = {
  reporterPhone: string
  ticketId: string
  mode?: 'manager' | 'worker'
  workerToken?: string
  onClose?: () => void
  attachments?: TicketAttachmentSummary[]
  onRecoverMedia?: () => void | Promise<void>
  recoveringMedia?: boolean
}

/** Safety-net poll when Realtime is quiet; was 15s and doubled Realtime load. */
const POLL_MS = 60_000

export function TicketWhatsAppThread({
  reporterPhone,
  ticketId,
  mode = 'manager',
  workerToken,
  onClose,
  attachments = [],
  onRecoverMedia,
  recoveringMedia = false,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const loadSeq = useRef(0)
  const logRef = useRef<HTMLDivElement>(null)
  const [mobileSheet, setMobileSheet] = useState(false)
  const [sheetReady, setSheetReady] = useState(false)
  const workerSheet = mode === 'worker' && mobileSheet
  const sheetFrame = useVisualViewportFrame(workerSheet)
  useChatSheetScrollLock(workerSheet)

  useEffect(() => {
    if (mode !== 'worker') return
    const check = () => setMobileSheet(getIsMobileViewport())
    check()
    setSheetReady(true)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [mode])

  const loadMessages = useCallback(async (opts?: { silent?: boolean }) => {
    const seq = ++loadSeq.current
    if (!opts?.silent) {
      setLoading(true)
      setLoadError(null)
    }
    try {
      const url =
        mode === 'worker' && workerToken
          ? `/api/worker/whatsapp-reply?token=${encodeURIComponent(workerToken)}&ticket_id=${encodeURIComponent(ticketId)}`
          : `/api/whatsapp/messages?ticket_id=${encodeURIComponent(ticketId)}`
      const res = await whatsappUiFetch(url)
      const json = (await res.json()) as {
        messages?: Message[]
        conversation_id?: string | null
        error?: string
      }
      if (!res.ok) throw new Error(json.error || 'טעינה נכשלה')
      if (seq !== loadSeq.current) return
      setMessages(json.messages ?? [])
      setConversationId(json.conversation_id ?? null)
      setLoadError(null)
    } catch (e) {
      if (seq !== loadSeq.current) return
      const msg = e instanceof Error ? e.message : 'טעינה נכשלה'
      if (!opts?.silent) {
        setLoadError(msg)
      }
    } finally {
      if (seq === loadSeq.current && !opts?.silent) {
        setLoading(false)
      }
    }
  }, [mode, workerToken, ticketId])

  useEffect(() => {
    void loadMessages()
  }, [loadMessages])

  useEffect(() => {
    if (!conversationId) return

    const channel = supabase
      .channel(`wa-ticket:${ticketId}:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          void loadMessages({ silent: true })
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [conversationId, ticketId, loadMessages])

  useEffect(() => {
    const pane = logRef.current
    if (!pane) return
    pane.scrollTop = pane.scrollHeight
  }, [messages.length, loading])

  useEffect(() => {
    const timer = window.setInterval(() => {
      // Skip background-tab polls — realtime still covers inserts while visible.
      if (typeof document !== 'undefined' && document.hidden) return
      void loadMessages({ silent: true })
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [loadMessages])

  async function sendReply() {
    const body = draft.trim()
    if (!body || sending) return
    if (mode === 'worker' && !workerToken) {
      toast.error('אין גישה — פתחו מחדש את הקישור האישי')
      return
    }

    setSending(true)
    try {
      const res = await whatsappUiMutate(
        mode === 'worker' ? '/api/worker/whatsapp-reply' : '/api/whatsapp/reply-resident',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            mode === 'worker'
              ? { token: workerToken, ticket_id: ticketId, body }
              : { ticket_id: ticketId, body }
          ),
        }
      )
      const json = (await res.json()) as {
        error?: string
        code?: number
        mode?: 'text' | 'template' | 'sms_fallback'
        fallback_from_template?: boolean
      }
      if (!res.ok) {
        const hint =
          json.code === 132001
            ? ' — פנו למשרד (תבנית Meta)'
            : ''
        throw new Error((json.error || 'שליחה נכשלה') + hint)
      }

      if (json.mode === 'sms_fallback') {
        toast.success('ההודעה נשלחה לדייר ב-SMS')
      } else if (json.fallback_from_template || json.mode === 'text') {
        toast.success(mode === 'worker' ? 'ההודעה נשלחה לדייר' : 'הודעה נשלחה לדייר ב-WhatsApp')
      } else {
        toast.success(mode === 'worker' ? 'ההודעה נשלחה לדייר' : 'ההודעה נשלחה לדייר ב-WhatsApp')
      }
      setDraft('')
      await loadMessages({ silent: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שליחה נכשלה')
    } finally {
      setSending(false)
    }
  }

  const isWorker = mode === 'worker'
  const phoneLabel = formatPhoneLocalIl(reporterPhone) ?? reporterPhone
  const needsMediaRecover =
    !isWorker &&
    !!onRecoverMedia &&
    threadHasUnrecoveredMedia(messages, attachments)

  const showEmptyThread = !loading && !loadError && messages.length === 0

  if (isWorker) {
    if (!sheetReady) {
      return <div className="wa-ticket" style={{ minHeight: 160 }} aria-hidden />
    }

    const thread: ReactNode = (
      <div className="wa-ticket" style={workerStyles.shell}>
        <div className="wa-ticket-header" style={workerStyles.header}>
          {workerSheet ? (
            <button
              type="button"
              className="wa-ticket-back"
              style={workerStyles.back}
              onClick={onClose}
              aria-label="חזרה לתקלה"
            >
              <WaBackIcon />
            </button>
          ) : null}
          <span style={workerStyles.avatar} aria-hidden>ד</span>
          <span style={workerStyles.identity}>
            <span style={workerStyles.title}>הדייר</span>
            <span style={workerStyles.sub}>{phoneLabel}</span>
          </span>
        </div>

        {loadError ? (
          <div style={styles.loadErrorBar}>
            <span style={styles.loadErrorText}>{loadError}</span>
            <button type="button" style={styles.retryBtn} onClick={() => void loadMessages()}>
              נסו שוב
            </button>
          </div>
        ) : null}

        <div
          ref={logRef}
          className="wa-ticket-log"
          role="log"
          aria-label="שיחת WhatsApp עם הדייר"
          aria-live="polite"
        >
          {loading && messages.length === 0 ? (
            <p style={workerStyles.chip}>טוען הודעות…</p>
          ) : showEmptyThread ? (
            <p style={workerStyles.chip}>אין הודעות עדיין. כתבו למטה.</p>
          ) : (
            messages.map((m, index) => {
              const day = waDayLabel(m.created_at)
              const prev = index > 0 ? messages[index - 1] : null
              const showDay = !prev || waDayLabel(prev.created_at) !== day
              const outgoing = m.direction === 'out'
              return (
                <div key={m.id} style={workerStyles.block}>
                  {showDay ? <div style={workerStyles.chip}>{day}</div> : null}
                  <div style={{ ...workerStyles.bubble, ...(outgoing ? workerStyles.out : workerStyles.in) }}>
                    <span style={workerStyles.body}>{displayWhatsAppBody(m)}</span>
                    <span style={workerStyles.time}>{waClock(m.created_at)}</span>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <div className="wa-ticket-compose" style={workerStyles.compose}>
          <label htmlFor={`wa-worker-${ticketId}`} style={workerStyles.srOnly}>
            הודעה לדייר
          </label>
          <textarea
            id={`wa-worker-${ticketId}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="הודעה"
            rows={1}
            maxLength={4096}
            style={workerStyles.input}
            disabled={sending}
          />
          <button
            type="button"
            aria-label="שלח לדייר"
            disabled={sending || !draft.trim()}
            onClick={() => void sendReply()}
            style={{
              ...workerStyles.send,
              ...((sending || !draft.trim()) ? workerStyles.sendOff : {}),
            }}
          >
            {sending ? <span style={workerStyles.sendWait}>…</span> : <WaSendIcon />}
          </button>
        </div>
      </div>
    )

    if (workerSheet && typeof document !== 'undefined') {
      return createPortal(
        <div
          className="wa-ticket-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="שיחת WhatsApp עם הדייר"
          data-keyboard={sheetFrame?.keyboardOpen ? 'open' : 'closed'}
          style={
            sheetFrame
              ? { top: sheetFrame.top, height: sheetFrame.height, bottom: 'auto' }
              : undefined
          }
        >
          {thread}
        </div>,
        document.body
      )
    }

    return thread
  }

  return (
    <div style={styles.root}>
      <div style={isWorker ? styles.sectionLabelWorker : styles.sectionLabel}>
        {isWorker ? 'שיחה עם הדייר' : 'ענה לדייר בוואטסאפ'}
      </div>

      {needsMediaRecover && (
        <div style={styles.recoverBar}>
          <span style={styles.recoverText}>
            {unrecoveredMediaLabel(messages)} מהשיחה לא צורף לתקלה
          </span>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            loading={recoveringMedia}
            onClick={() => void onRecoverMedia?.()}
          >
            שחזר מ-WhatsApp
          </Button>
        </div>
      )}

      {loadError ? (
        <div style={styles.loadErrorBar}>
          <span style={styles.loadErrorText}>{loadError}</span>
          <button type="button" style={styles.retryBtn} onClick={() => void loadMessages()}>
            נסו שוב
          </button>
        </div>
      ) : null}

      {loading && messages.length === 0 ? (
        <p style={styles.muted}>{isWorker ? 'טוען הודעות…' : 'טוען שיחת WhatsApp…'}</p>
      ) : showEmptyThread ? (
        <p style={styles.muted}>
          {isWorker ? 'עדיין אין הודעות — כתבו למטה ושלחו לדייר.' : 'אין הודעות WhatsApp שמורות — אפשר לשלוח הודעה ראשונה.'}
        </p>
      ) : messages.length > 0 ? (
        <div
          style={isWorker ? styles.wrapWorker : styles.wrap}
          role="log"
          aria-label="שיחת WhatsApp עם הדייר"
          aria-live="polite"
        >
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                ...styles.bubble,
                ...(m.direction === 'out' ? styles.out : styles.in),
              }}
            >
              <div>{displayWhatsAppBody(m)}</div>
              <div style={styles.time}>
                {new Date(m.created_at).toLocaleString('he-IL')}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div style={styles.compose}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={isWorker ? 'כתבו כאן הודעה לדייר…' : 'כתבו הודעה לדייר/ה…'}
          rows={isWorker ? 4 : 3}
          maxLength={4096}
          style={isWorker ? styles.textareaWorker : styles.textarea}
          disabled={sending}
        />
        <Button
          variant="primary"
          size={isWorker ? 'md' : 'sm'}
          loading={sending}
          disabled={!draft.trim()}
          onClick={() => void sendReply()}
        >
          {isWorker ? 'שלח לדייר' : 'שליחה ב-WhatsApp'}
        </Button>
        <p style={styles.hint}>
          הדייר כבר דיווח — כתבו ושלחו. ההודעה תגיע ב-WhatsApp; אם לא אפשרי, נשלח SMS גיבוי. הדייר לא צריך לעשות דבר נוסף.
        </p>
      </div>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', gap: 12 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  sectionLabelWorker: {
    fontSize: 14,
    fontWeight: 800,
    color: theme.colors.textPrimary,
  },
  wrap: { display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto', padding: 4 },
  wrapWorker: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    maxHeight: 'min(42vh, 280px)',
    overflowY: 'auto',
    padding: 6,
    WebkitOverflowScrolling: 'touch',
  },
  bubble: { padding: '10px 12px', borderRadius: 12, fontSize: 14, maxWidth: '92%', lineHeight: 1.4 },
  in: { alignSelf: 'flex-start', background: theme.colors.muted },
  out: { alignSelf: 'flex-end', background: '#dcf8c6' },
  time: { fontSize: 10, color: theme.colors.textMuted, marginTop: 4 },
  muted: { color: theme.colors.textMuted, fontSize: 13, margin: 0 },
  loadErrorBar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    background: theme.colors.warningMuted,
    border: `1px solid ${theme.colors.warning}`,
  },
  loadErrorText: { fontSize: 13, color: theme.colors.textPrimary, flex: 1, minWidth: 160 },
  retryBtn: {
    padding: '6px 12px',
    borderRadius: theme.radius.sm,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  compose: { display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8, borderTop: `1px solid ${theme.colors.border}` },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    background: theme.colors.surfaceElevated,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.md,
    padding: '10px 12px',
    fontSize: 14,
    color: theme.colors.textPrimary,
    resize: 'vertical',
    minHeight: 72,
    fontFamily: 'inherit',
    lineHeight: 1.4,
  },
  textareaWorker: {
    width: '100%',
    boxSizing: 'border-box',
    background: theme.colors.surface,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: 12,
    padding: '14px 16px',
    fontSize: 16,
    color: theme.colors.textPrimary,
    resize: 'vertical',
    minHeight: 96,
    fontFamily: 'inherit',
    lineHeight: 1.45,
  },
  hint: { fontSize: 11, color: theme.colors.textMuted, margin: 0, lineHeight: 1.4 },
  recoverBar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    background: theme.colors.warningMuted,
    border: `1px solid ${theme.colors.warning}`,
  },
  recoverText: { fontSize: 13, color: theme.colors.textPrimary, fontWeight: 500 },
}

const workerStyles: Record<string, CSSProperties> = {
  shell: { display: 'flex', flexDirection: 'column', background: '#fff', minHeight: 0, flex: '1 1 auto' },
  back: {
    width: 44,
    height: 44,
    border: 'none',
    background: 'transparent',
    color: '#54656f',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    flexShrink: 0,
    cursor: 'pointer',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minHeight: 58,
    padding: '8px 12px',
    background: '#f0f2f5',
    borderBottom: '1px solid #e9edef',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: '#00a884',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    flexShrink: 0,
  },
  identity: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  title: { fontSize: 16, fontWeight: 600, color: '#111b21' },
  sub: { fontSize: 12, color: '#667781' },
  block: { display: 'flex', flexDirection: 'column' },
  chip: {
    alignSelf: 'center',
    margin: '8px 0',
    padding: '5px 12px',
    borderRadius: 8,
    background: '#fff',
    color: '#54656f',
    fontSize: 12.5,
    boxShadow: '0 1px 0.5px rgba(11, 20, 26, 0.13)',
  },
  bubble: {
    maxWidth: '82%',
    margin: '1px 0',
    padding: '6px 8px 4px 9px',
    borderRadius: 8,
    fontSize: 14.5,
    lineHeight: 1.35,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    columnGap: 8,
    boxShadow: '0 1px 0.5px rgba(11, 20, 26, 0.13)',
  },
  body: { whiteSpace: 'pre-wrap', minWidth: 0 },
  in: { alignSelf: 'flex-start', background: '#fff', color: '#111b21', borderEndStartRadius: 2 },
  out: { alignSelf: 'flex-end', background: '#d9fdd3', color: '#111b21', borderEndEndRadius: 2 },
  time: { marginInlineStart: 'auto', fontSize: 11, lineHeight: 1, color: '#667781', paddingBottom: 2, whiteSpace: 'nowrap' },
  compose: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 8,
    padding: '8px 10px',
    background: '#f0f2f5',
  },
  input: {
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
  send: {
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
  sendOff: { background: '#8696a0', cursor: 'default' },
  sendWait: { fontSize: 18, lineHeight: 1 },
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
