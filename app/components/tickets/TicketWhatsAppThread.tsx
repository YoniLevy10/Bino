'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { Button, theme } from '../ui'

type Message = {
  id: string
  direction: 'in' | 'out'
  body: string | null
  message_type?: string | null
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
}

const POLL_MS = 15_000

export function TicketWhatsAppThread({
  reporterPhone: _reporterPhone,
  ticketId,
  mode = 'manager',
  workerToken,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const loadSeq = useRef(0)

  const loadMessages = useCallback(async (opts?: { silent?: boolean }) => {
    const seq = ++loadSeq.current
    if (!opts?.silent) {
      setLoading(true)
      setError(null)
    }
    try {
      const url =
        mode === 'worker' && workerToken
          ? `/api/worker/whatsapp-reply?token=${encodeURIComponent(workerToken)}&ticket_id=${encodeURIComponent(ticketId)}`
          : `/api/whatsapp/messages?ticket_id=${encodeURIComponent(ticketId)}`
      const res = await fetchWithTimeout(url)
      const json = (await res.json()) as {
        messages?: Message[]
        conversation_id?: string | null
        error?: string
      }
      if (!res.ok) throw new Error(json.error || 'טעינה נכשלה')
      if (seq !== loadSeq.current) return
      setMessages(json.messages ?? [])
      setConversationId(json.conversation_id ?? null)
    } catch (e) {
      if (seq !== loadSeq.current) return
      if (!opts?.silent) {
        setError(e instanceof Error ? e.message : 'טעינה נכשלה')
        setMessages([])
        setConversationId(null)
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
      const res = await fetchWithTimeout(
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
        mode?: 'text' | 'template'
        fallback_from_template?: boolean
      }
      if (!res.ok) throw new Error(json.error || 'שליחה נכשלה')

      if (json.fallback_from_template || json.mode === 'text') {
        toast.success(mode === 'worker' ? 'ההודעה נשלחה לדייר' : 'הודעה נשלחה כהודעה חופשית (גיבוי — תבנית Meta לא זמינה)')
      } else {
        toast.success(mode === 'worker' ? 'ההודעה נשלחה לדייר' : 'ההודעה נשלחה דרך תבנית manager_reply')
      }
      setDraft('')
      await loadMessages()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שליחה נכשלה')
    } finally {
      setSending(false)
    }
  }

  const isWorker = mode === 'worker'

  return (
    <div style={styles.root}>
      <div style={isWorker ? styles.sectionLabelWorker : styles.sectionLabel}>
        {isWorker ? 'שיחה עם הדייר' : 'ענה לדייר בוואטסאפ'}
      </div>

      {loading ? (
        <p style={styles.muted}>{isWorker ? 'טוען הודעות…' : 'טוען שיחת WhatsApp…'}</p>
      ) : error ? (
        <p style={styles.err}>{error}</p>
      ) : messages.length === 0 ? (
        <p style={styles.muted}>
          {isWorker ? 'עדיין אין הודעות — כתבו למטה ושלחו לדייר.' : 'אין הודעות WhatsApp שמורות — אפשר לשלוח הודעה ראשונה.'}
        </p>
      ) : (
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
      )}

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
        {!isWorker ? (
          <p style={styles.hint}>
            הטקסט שתכתבו נשלח דרך תבנית Meta manager_reply (שלום + שם הדייר/ה + ההודעה).
          </p>
        ) : null}
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
  err: { color: theme.colors.error, fontSize: 13, margin: 0 },
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
}
