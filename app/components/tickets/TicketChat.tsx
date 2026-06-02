'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { Button, theme } from '../ui'

type Row = {
  id: string
  ticket_id: string
  sender_name: string
  body: string
  created_at: string
}

interface TicketChatProps {
  ticketId: string | null
  clientId: string | null
}

export function TicketChat({ ticketId, clientId }: TicketChatProps) {
  const [messages, setMessages] = useState<Row[]>([])
  const [senderName, setSenderName] = useState('')
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    if (!ticketId) {
      setMessages([])
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('ticket_internal_messages')
      .select('id, ticket_id, sender_name, body, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true })
    if (!error && data) {
      setMessages(data as Row[])
    } else {
      setMessages([])
    }
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [ticketId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  useEffect(() => {
    if (!ticketId) return

    const channel = supabase
      .channel(`ticket-internal:${ticketId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ticket_internal_messages',
          filter: `ticket_id=eq.${ticketId}`,
        },
        (payload) => {
          const row = payload.new as Row
          if (row?.id) {
            setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]))
          }
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [ticketId])

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!ticketId || !body.trim() || !clientId) return
    const name = senderName.trim() || 'צוות'
    setSending(true)
    const res = await fetchWithTimeout('/api/ticket-internal-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticket_id: ticketId,
        sender_name: name,
        body: body.trim(),
      }),
    })
    setSending(false)
    if (!res?.ok) {
      const json = (await res?.json().catch(() => ({}))) as { error?: string }
      console.error(json.error || 'send failed')
      return
    }
    setBody('')
    void load()
  }

  if (!ticketId) return null

  return (
    <div style={styles.wrap}>
      <div style={styles.label}>צ׳אט פנימי</div>
      <div style={styles.box}>
        {loading ? (
          <div style={styles.muted}>טוען הודעות…</div>
        ) : messages.length === 0 ? (
          <div style={styles.muted}>אין הודעות פנימיות. כתבו עדכון לצוות.</div>
        ) : (
          <div style={styles.list}>
            {messages.map((m) => (
              <div key={m.id} style={styles.bubble}>
                <div style={styles.meta}>
                  <span style={styles.name}>{m.sender_name}</span>
                  <span style={styles.time}>
                    {new Date(m.created_at).toLocaleString('he-IL', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <div style={styles.text}>{m.body}</div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
      <form onSubmit={send} style={styles.form}>
        <input
          type="text"
          value={senderName}
          onChange={(e) => setSenderName(e.target.value)}
          placeholder="שם השולח"
          style={styles.input}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="הודעה…"
          rows={2}
          style={styles.textarea}
        />
        <Button type="submit" variant="secondary" size="sm" loading={sending} disabled={!body.trim()}>
          שליחה
        </Button>
      </form>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    paddingTop: '8px',
    borderTop: `1px solid ${theme.colors.border}`,
  },
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  box: {
    maxHeight: '220px',
    overflowY: 'auto',
    padding: '4px 0',
  },
  muted: { fontSize: '13px', color: theme.colors.textMuted, padding: '8px 0' },
  list: { display: 'flex', flexDirection: 'column', gap: '10px' },
  bubble: {
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    background: theme.colors.muted,
    border: `1px solid ${theme.colors.border}`,
  },
  meta: { display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' },
  name: { fontSize: '12px', fontWeight: 600, color: theme.colors.primary },
  time: { fontSize: '11px', color: theme.colors.textMuted },
  text: { fontSize: '14px', color: theme.colors.textPrimary, lineHeight: 1.45, whiteSpace: 'pre-wrap' },
  form: { display: 'flex', flexDirection: 'column', gap: '8px' },
  input: {
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    fontSize: '14px',
  },
  textarea: {
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    fontSize: '14px',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
}
