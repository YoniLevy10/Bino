'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { whatsappUiFetch, whatsappUiMutate } from '@/lib/whatsapp-ui-fetch'
import { toast } from '@/lib/error-handler'
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
  attachments?: TicketAttachmentSummary[]
  onRecoverMedia?: () => void | Promise<void>
  recoveringMedia?: boolean
}

const POLL_MS = 15_000

export function TicketWhatsAppThread({
  reporterPhone: _reporterPhone,
  ticketId,
  mode = 'manager',
  workerToken,
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
    const timer = window.setInterval(() => {
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
        mode?: 'text' | 'template'
        fallback_from_template?: boolean
      }
      if (!res.ok) {
        const hint =
          json.code === 132001
            ? ' — תבנית manager_reply לא מאושרת ב-Meta (נדרש מחוץ ל-24 שעות)'
            : json.code === 131047
              ? ' — חלון 24 שעות פג; הדייר/ה צריכ/ה לשלוח הודעה לוואטסאפ של הבניין'
              : ''
        throw new Error((json.error || 'שליחה נכשלה') + hint)
      }

      if (json.fallback_from_template || json.mode === 'text') {
        toast.success(mode === 'worker' ? 'ההודעה נשלחה לדייר' : 'הודעה נשלחה כהודעה חופשית (גיבוי — תבנית Meta לא זמינה)')
      } else {
        toast.success(mode === 'worker' ? 'ההודעה נשלחה לדייר' : 'ההודעה נשלחה דרך תבנית manager_reply')
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
  const needsMediaRecover =
    !isWorker &&
    !!onRecoverMedia &&
    threadHasUnrecoveredMedia(messages, attachments)

  const showEmptyThread = !loading && !loadError && messages.length === 0

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
          {isWorker
            ? 'בתוך 24 שעות מהודעת הדייר/ה — נשלח טקסט חופשי. אחרת דרך תבנית manager_reply. אפשר לשלוח גם אם ההיסטוריה לא נטענה.'
            : 'בתוך 24 שעות מהודעת הדייר/ה — טקסט חופשי; אחרת תבנית Meta manager_reply. אפשר לשלוח גם כשטעינת ההיסטוריה נכשלה.'}
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
