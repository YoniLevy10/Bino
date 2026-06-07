'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { theme } from '../ui'

type Message = {
  id: string
  direction: 'in' | 'out'
  body: string | null
  created_at: string
}

type Props = {
  reporterPhone: string
}

export function TicketWhatsAppThread({ reporterPhone }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetchWithTimeout(
          `/api/whatsapp/messages?phone=${encodeURIComponent(reporterPhone)}`
        )
        const json = (await res.json()) as { messages?: Message[]; error?: string }
        if (!res.ok) throw new Error(json.error || 'טעינה נכשלה')
        if (!cancelled) setMessages(json.messages ?? [])
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'טעינה נכשלה')
          setMessages([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [reporterPhone])

  if (loading) return <p style={styles.muted}>טוען שיחת WhatsApp…</p>
  if (error) return <p style={styles.err}>{error}</p>
  if (messages.length === 0) {
    return <p style={styles.muted}>אין הודעות WhatsApp שמורות לטלפון זה.</p>
  }

  return (
    <div style={styles.wrap} role="log" aria-label="שיחת WhatsApp עם הדייר">
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
  )
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto', padding: 4 },
  bubble: { padding: '8px 10px', borderRadius: 10, fontSize: 13, maxWidth: '90%' },
  in: { alignSelf: 'flex-start', background: theme.colors.muted },
  out: { alignSelf: 'flex-end', background: '#dcf8c6' },
  time: { fontSize: 10, color: theme.colors.textMuted, marginTop: 4 },
  muted: { color: theme.colors.textMuted, fontSize: 13, margin: 0 },
  err: { color: theme.colors.error, fontSize: 13, margin: 0 },
}
