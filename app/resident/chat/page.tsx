'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ResidentAlert,
  ResidentField,
  ResidentMuted,
  ResidentPageTitle,
  ResidentPrimaryButton,
  residentTheme,
} from '@/app/components/resident/residentUi'
import {
  RESIDENT_BOT_QUICK_PROMPTS,
  isExternalResidentHref,
  residentBotVisibleActions,
  type ResidentBotAction,
} from '@/lib/resident-portal/bot-ui'

type ChatMsg = { role: 'user' | 'assistant'; content: string }

export default function ResidentChatPage() {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      content:
        'שלום! אפשר לשאול על תקלה, תשלומים, הודעות או שעות מתקנים. לא אמציא נתונים חסרים — ואפשר גם לפתוח קריאה מכאן.',
    },
  ])
  const [input, setInput] = useState('')
  const [pendingConfirm, setPendingConfirm] = useState<{
    message: string
    scope?: string
  } | null>(null)
  const [linkActions, setLinkActions] = useState<ResidentBotAction[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, pendingConfirm, linkActions])

  async function send(payload: Record<string, unknown>) {
    setLoading(true)
    setError('')
    setLinkActions([])
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
      const actions = (json.actions || []) as ResidentBotAction[]
      const visible = residentBotVisibleActions(actions)
      const confirm = visible.find((a) => a.type === 'create_ticket' && a.payload)
      if (confirm?.payload) {
        setPendingConfirm({
          message: confirm.payload.message || String(payload.message || ''),
          scope: confirm.payload.scope,
        })
      } else {
        setPendingConfirm(null)
      }
      setLinkActions(
        visible.filter((a) => a.href && !(a.type === 'create_ticket' && a.payload))
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאת רשת')
    } finally {
      setLoading(false)
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const message = input.trim()
    if (!message || loading) return
    setMessages((prev) => [...prev, { role: 'user', content: message }])
    setInput('')
    await send({ message })
  }

  async function sendQuick(message: string) {
    if (loading) return
    setMessages((prev) => [...prev, { role: 'user', content: message }])
    await send({ message })
  }

  return (
    <div
      className="resident-chat"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div
        className="lg-glass resident-card"
        style={{ padding: '14px 16px', borderRadius: residentTheme.radius.lg }}
      >
        <ResidentPageTitle>בוט דיירים</ResidentPageTitle>
        <ResidentMuted style={{ marginTop: 6 }}>
          פתיחת תקלה ושאלות על תשלומים/הודעות/מתקנים — בלי להמתין למנהל.
        </ResidentMuted>
        <div
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}
          aria-label="שאלות מהירות"
        >
          {RESIDENT_BOT_QUICK_PROMPTS.map((q) => (
            <button
              key={q.label}
              type="button"
              disabled={loading}
              className="lg-chip resident-btn-press"
              onClick={() => void sendQuick(q.message)}
              style={{
                cursor: loading ? 'wait' : 'pointer',
                border: 'none',
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 600,
                padding: '8px 12px',
                minHeight: 40,
                background: 'rgba(255,255,255,0.92)',
              }}
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={listRef}
        className="lg-glass resident-card"
        style={{
          display: 'grid',
          alignContent: 'start',
          gap: 8,
          overflow: 'auto',
          minHeight: 140,
          maxHeight: 280,
          padding: 14,
          borderRadius: residentTheme.radius.lg,
        }}
      >
        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={m.role === 'user' ? 'lg-chip lg-chip-active' : 'lg-chip'}
            style={{
              justifySelf: m.role === 'user' ? 'start' : 'stretch',
              padding: 12,
              borderRadius: residentTheme.radius.md,
              whiteSpace: 'pre-wrap',
              fontSize: 15,
              lineHeight: 1.45,
              maxWidth: m.role === 'user' ? '92%' : '100%',
            }}
          >
            {m.content}
          </div>
        ))}
      </div>

      {error ? (
        <ResidentAlert tone="error">
          {error}.{' '}
          <Link href="/resident/tickets" style={{ color: 'inherit', fontWeight: 700 }}>
            מעבר לטופס תקלות
          </Link>
        </ResidentAlert>
      ) : null}

      <div
        className="lg-glass resident-card"
        style={{
          display: 'grid',
          gap: 8,
          flexShrink: 0,
          padding: 12,
          borderRadius: residentTheme.radius.lg,
        }}
      >
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
          >
            אישור ופתיחת קריאה
          </ResidentPrimaryButton>
        ) : null}
        {linkActions.map((a, idx) => {
          const href = a.href || '/resident'
          if (isExternalResidentHref(href)) {
            return (
              <a
                key={`${a.type}-${idx}`}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="lg-btn lg-btn-primary resident-btn-press"
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  minHeight: 48,
                  textDecoration: 'none',
                  color: '#fff',
                  fontWeight: 700,
                  borderRadius: residentTheme.radius.md,
                }}
              >
                {a.label}
              </a>
            )
          }
          return (
            <ResidentPrimaryButton key={`${a.type}-${idx}`} href={href}>
              {a.label}
            </ResidentPrimaryButton>
          )
        })}
        <form onSubmit={onSubmit} style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
          <ResidentField
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="כתבו הודעה…"
            aria-label="הודעה לבוט"
            disabled={loading}
            style={{ flex: 1, background: 'rgba(255,255,255,0.95)' }}
          />
          <ResidentPrimaryButton
            type="submit"
            disabled={loading || !input.trim()}
            style={{ width: 'auto', minWidth: 88, padding: '0 16px' }}
          >
            {loading ? '…' : 'שליחה'}
          </ResidentPrimaryButton>
        </form>
      </div>
    </div>
  )
}
