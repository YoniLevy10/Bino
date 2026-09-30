'use client'

import { FormEvent, useState } from 'react'
import Link from 'next/link'
import {
  ResidentAlert,
  ResidentCard,
  ResidentField,
  ResidentPageTitle,
  ResidentPrimaryButton,
  residentTheme,
} from '@/app/components/resident/residentUi'

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
      <ResidentPageTitle>בוט דיירים</ResidentPageTitle>
      <ResidentCard
        style={{
          flex: 1,
          display: 'grid',
          gap: 8,
          maxHeight: '50dvh',
          overflow: 'auto',
        }}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === 'user' ? 'lg-chip lg-chip-active' : 'lg-chip'}
            style={{
              justifySelf: m.role === 'user' ? 'start' : 'stretch',
              padding: 10,
              borderRadius: residentTheme.radius.md,
              whiteSpace: 'pre-wrap',
              fontSize: 15,
            }}
          >
            {m.content}
          </div>
        ))}
      </ResidentCard>
      {error ? (
        <ResidentAlert tone="error">
          {error}.{' '}
          <Link href="/resident/tickets" style={{ color: 'inherit', fontWeight: 700 }}>
            מעבר לטופס תקלות
          </Link>
        </ResidentAlert>
      ) : null}
      {pendingConfirm ? (
        <ResidentPrimaryButton
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
            background: 'linear-gradient(180deg, #4cd964 0%, #34C759 46%, #2fb350 100%)',
          }}
        >
          אישור ופתיחת קריאה
        </ResidentPrimaryButton>
      ) : null}
      <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8 }}>
        <ResidentField
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="כתבו הודעה…"
          style={{ flex: 1 }}
        />
        <ResidentPrimaryButton
          type="submit"
          disabled={loading}
          style={{ width: 'auto', minWidth: 84, padding: '0 16px' }}
        >
          שליחה
        </ResidentPrimaryButton>
      </form>
    </div>
  )
}
