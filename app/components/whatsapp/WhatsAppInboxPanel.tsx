'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { Button, theme } from '../ui'

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

export function WhatsAppInboxPanel() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const selected = conversations.find((c) => c.id === selectedId) ?? null

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
    try {
      const res = await fetchWithTimeout(`/api/whatsapp/messages?conversation_id=${conversationId}`)
      const json = (await res.json()) as { messages?: Message[]; error?: string }
      if (!res.ok) throw new Error(json.error || 'טעינה נכשלה')
      setMessages(json.messages ?? [])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינת הודעות נכשלה')
    }
  }, [])

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  useEffect(() => {
    if (!selectedId) return
    void loadMessages(selectedId)

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
  }, [selectedId, loadMessages, loadConversations])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function sendReply() {
    if (!selected || !reply.trim()) return
    setSending(true)
    try {
      const res = await fetchWithTimeout('/api/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: selected.phone, body: reply.trim(), conversation_id: selected.id }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error || 'שליחה נכשלה')
      setReply('')
      await loadMessages(selected.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'שליחה נכשלה')
    } finally {
      setSending(false)
    }
  }

  function residentLabel(c: Conversation): string {
    const r = Array.isArray(c.residents) ? c.residents[0] : c.residents
    if (r?.full_name) {
      return r.apartment_number ? `${r.full_name} · דירה ${r.apartment_number}` : r.full_name
    }
    return c.phone
  }

  return (
    <div style={styles.wrap}>
      <aside style={styles.list} aria-label="רשימת שיחות WhatsApp">
        {loading ? (
          <p style={styles.muted}>טוען…</p>
        ) : conversations.length === 0 ? (
          <p style={styles.muted}>אין שיחות עדיין — הודעות יופיעו כאן אחרי דיירים שיכתבו.</p>
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

      <section style={styles.thread} aria-label="תוכן השיחה">
        {!selected ? (
          <p style={styles.muted}>בחרו שיחה מהרשימה</p>
        ) : (
          <>
            <div style={styles.threadHeader}>{residentLabel(selected)}</div>
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
              <label htmlFor="wa-reply" style={styles.srOnly}>
                תשובה לדייר
              </label>
              <textarea
                id="wa-reply"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={2}
                placeholder="כתבו תשובה (חלון 24 שעות)…"
                style={styles.textarea}
              />
              <Button onClick={() => void sendReply()} disabled={sending || !reply.trim()}>
                {sending ? 'שולח…' : 'שלח'}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 16, minHeight: 420 },
  list: { border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.lg, overflow: 'auto', maxHeight: 520 },
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
  thread: { border: `1px solid ${theme.colors.border}`, borderRadius: theme.radius.lg, display: 'flex', flexDirection: 'column', minHeight: 420 },
  threadHeader: { padding: '12px 16px', borderBottom: `1px solid ${theme.colors.border}`, fontWeight: 600 },
  messages: { flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 },
  bubble: { maxWidth: '85%', padding: '10px 12px', borderRadius: 12, fontSize: 14, lineHeight: 1.45 },
  bubbleIn: { alignSelf: 'flex-start', background: theme.colors.muted, color: theme.colors.textPrimary },
  bubbleOut: { alignSelf: 'flex-end', background: '#dcf8c6', color: theme.colors.textPrimary },
  time: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4 },
  compose: { padding: 12, borderTop: `1px solid ${theme.colors.border}`, display: 'flex', flexDirection: 'column', gap: 8 },
  textarea: { width: '100%', resize: 'vertical', padding: 10, borderRadius: 8, border: `1px solid ${theme.colors.border}`, fontFamily: 'inherit' },
  muted: { padding: 16, color: theme.colors.textMuted, margin: 0 },
  srOnly: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' },
}
