'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'

type ChatMsg = { role: 'user' | 'assistant'; content: string }

export default function ResidentChatPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      content: 'שלום! אפשר לשאול על תקלה, תשלומים, הודעות או שעות מתקנים. לא אמציא נתונים חסרים.',
    },
  ])
  const [input, setInput] = useState('')
  const [pendingConfirm, setPendingConfirm] = useState<{
    message: string
    scope?: string
  } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function send(payload: Record<string, unknown>) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/resident/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'הבוט נכשל — השתמשו בטופס התקלות')
        return
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: json.reply }])
      type ChatAction = {
        type: string
        payload?: { message?: string; scope?: string }
      }
      const actions = (json.actions || []) as ChatAction[]
      const action = actions.find((a) => a.type === 'create_ticket' && a.payload)
      if (action?.payload) {
        setPendingConfirm({
          message: action.payload.message || String(payload.message || ''),
          scope: action.payload.scope,
        })
      } else {
        setPendingConfirm(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאת רשת')
    } finally {
      setLoading(false)
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const message = input.trim()
    if (!message) return
    setMessages((prev) => [...prev, { role: 'user', content: message }])
    setInput('')
    await send({ message })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: '60dvh' }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>בוט דיירים</h1>
      <div
        style={{
          flex: 1,
          background: '#fff',
          borderRadius: 16,
          border: '1px solid #E8E8ED',
          padding: 12,
          display: 'grid',
          gap: 8,
          maxHeight: '50dvh',
          overflow: 'auto',
        }}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              justifySelf: m.role === 'user' ? 'start' : 'stretch',
              background: m.role === 'user' ? '#E5F2FF' : '#F5F5F7',
              padding: 10,
              borderRadius: 12,
              whiteSpace: 'pre-wrap',
              fontSize: 15,
            }}
          >
            {m.content}
          </div>
        ))}
      </div>
      {error ? (
        <div role="alert" style={{ color: '#FF3B30' }}>
          {error}. <Link href="/resident/tickets">מעבר לטופס תקלות</Link>
        </div>
      ) : null}
      {pendingConfirm ? (
        <button
          type="button"
          disabled={loading}
          onClick={() =>
            void send({
              message: pendingConfirm.message,
              confirmCreate: true,
              scope: pendingConfirm.scope,
              idempotency_key:
                typeof crypto !== 'undefined' && crypto.randomUUID
                  ? crypto.randomUUID()
                  : `bot-${Date.now()}`,
            })
          }
          style={{
            minHeight: 48,
            border: 'none',
            borderRadius: 12,
            background: '#34C759',
            color: '#fff',
            fontWeight: 700,
          }}
        >
          אישור ופתיחת קריאה
        </button>
      ) : null}
      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="כתבו הודעה…"
          style={{
            flex: 1,
            minHeight: 48,
            fontSize: 16,
            borderRadius: 12,
            border: '1px solid #D1D1D6',
            padding: '0 12px',
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            minHeight: 48,
            minWidth: 72,
            border: 'none',
            borderRadius: 12,
            background: '#007AFF',
            color: '#fff',
            fontWeight: 700,
          }}
        >
          שליחה
        </button>
      </form>
    </div>
  )
}
