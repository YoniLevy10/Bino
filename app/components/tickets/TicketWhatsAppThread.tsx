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
  created_at: string
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
      const json = (await res.json()) as { error?: string; mode?: 'text' | 'template' }
      if (!res.ok) throw new Error(json.error || 'שליחה נכשלה')

      if (json.mode === 'text') {
        toast.success('הודעה נשלחה כהודעה חופשית (גיבוי — תבנית Meta לא זמינה)')
      } else {
        toast.success('ההודעה נשלחה דרך תבנית manager_reply — כשהדייר/ה יגיב/תגיב אפשר לכתוב חופשי')
      }
      setDraft('')
      await loadMessages()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שליחה נכשלה')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={styles.root}>
      <div style={styles.sectionLabel}>ענה לדייר בוואטסאפ</div>

      {loading ? (
        <p style={styles.muted}>טוען שיחת WhatsApp…</p>
      ) : error ? (
        <p style={styles.err}>{error}</p>
      ) : messages.length === 0 ? (
        <p style={styles.muted}>אין הודעות WhatsApp שמורות — אפשר לשלוח הודעה ראשונה.</p>
      ) : (
        <div style={styles.wrap} role="log" aria-label="שיחת WhatsApp עם הדייר" aria-live="polite">
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                ...styles.bubble,
                ...(m.direction === 'out' ? styles.out : styles.in),
              }}
            >
              <div>{m.body || '—'}</div>
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
          placeholder="כתבו הודעה לדייר/ה…"
          rows={3}
          maxLength={4096}
          style={styles.textarea}
          disabled={sending}
        />
        <Button
          variant="primary"
          size="sm"
          loading={sending}
          disabled={!draft.trim()}
          onClick={() => void sendReply()}
        >
          שליחה ב-WhatsApp
        </Button>
        <p style={styles.hint}>
          הטקסט שתכתבו נשלח דרך תבנית Meta manager_reply (שלום + שם הדייר/ה + ההודעה). עובד גם מחוץ לחלון 24 שעות.
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
  wrap: { display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto', padding: 4 },
  bubble: { padding: '8px 10px', borderRadius: 10, fontSize: 13, maxWidth: '90%' },
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
  hint: { fontSize: 11, color: theme.colors.textMuted, margin: 0, lineHeight: 1.4 },
}
