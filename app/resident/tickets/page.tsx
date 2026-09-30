'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  MIDRAG_TRADE_CATEGORIES,
  buildMidragCityPickerUrl,
  buildMidragSearchUrl,
  midragCityMatchForCity,
  tradeLabelHe,
} from '@/lib/midrag/external-search'

type Ticket = {
  id: string
  ticket_number: number
  status: string
  description: string | null
  scope: string | null
  opened_at: string | null
  closed_at: string | null
}

export default function ResidentTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [description, setDescription] = useState('')
  const [scope, setScope] = useState<'common' | 'private' | 'unclear'>('unclear')
  const [trade, setTrade] = useState('plumbing')
  const [city, setCity] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const idempotencyKey = useMemo(
    () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}`),
    []
  )

  async function reload() {
    const res = await fetch('/api/resident/tickets')
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'טעינת תקלות נכשלה')
    setTickets(json.tickets || [])
  }

  useEffect(() => {
    void reload().catch((e) => setError(e instanceof Error ? e.message : 'שגיאה'))
    void fetch('/api/resident/home')
      .then((r) => r.json())
      .then((h) => setCity(h.project?.city || null))
      .catch(() => {})
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/resident/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description,
          scope,
          trade_category: trade,
          idempotency_key: idempotencyKey,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'פתיחת קריאה נכשלה')
        return
      }
      setSuccess(
        `נפתחה קריאה מספר ${json.ticketNumber}${json.reused ? ' (כבר הייתה קיימת)' : ''}`
      )
      if (json.note) setSuccess((s) => `${s}. ${json.note}`)
      setDescription('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאת רשת')
    } finally {
      setLoading(false)
    }
  }

  const cityMatch = midragCityMatchForCity(city)
  const midragUrl = cityMatch ? buildMidragSearchUrl({ category: trade, city }) : null

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>התקלות שלי</h1>

      <form
        onSubmit={onSubmit}
        style={{ background: '#fff', borderRadius: 16, padding: 16, border: '1px solid #E8E8ED' }}
      >
        <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>פתיחת תקלה</h2>
        <label style={{ fontSize: 13 }}>תיאור</label>
        <textarea
          required
          minLength={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          style={{ width: '100%', fontSize: 16, padding: 12, borderRadius: 10, border: '1px solid #D1D1D6', boxSizing: 'border-box' }}
        />
        <label style={{ fontSize: 13, display: 'block', marginTop: 10 }}>סוג</label>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as typeof scope)}
          style={{ width: '100%', minHeight: 44, fontSize: 16, marginBottom: 10 }}
        >
          <option value="common">שטח משותף</option>
          <option value="private">דירה פרטית</option>
          <option value="unclear">לא ברור</option>
        </select>
        {scope === 'private' ? (
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 13 }}>מקצוע לחיפוש במידרג</label>
            <select
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              style={{ width: '100%', minHeight: 44, fontSize: 16 }}
            >
              {MIDRAG_TRADE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {tradeLabelHe(c)}
                </option>
              ))}
            </select>
            <p style={{ fontSize: 12, color: '#86868B' }}>
              תקלה פרטית אינה משובצת אוטומטית. פתיחת מידרג אינה הזמנה.
            </p>
            {midragUrl ? (
              <a href={midragUrl} target="_blank" rel="noopener noreferrer">
                חיפוש במידרג ({city})
              </a>
            ) : (
              <a
                href={buildMidragCityPickerUrl({ category: trade, city }) || 'https://www.midrag.co.il/'}
                target="_blank"
                rel="noopener noreferrer"
              >
                בחירת עיר במידרג
              </a>
            )}
          </div>
        ) : null}
        {error ? (
          <div role="alert" style={{ color: '#FF3B30', marginBottom: 8 }}>
            {error}
          </div>
        ) : null}
        {success ? (
          <div role="status" style={{ color: '#16a34a', marginBottom: 8 }}>
            {success}
          </div>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            minHeight: 48,
            border: 'none',
            borderRadius: 12,
            background: '#007AFF',
            color: '#fff',
            fontWeight: 700,
            fontSize: 16,
          }}
        >
          {loading ? 'שולח…' : 'פתיחת קריאה'}
        </button>
      </form>

      <section>
        <h2 style={{ fontSize: 16 }}>הקריאות שלי</h2>
        {tickets.length === 0 ? (
          <p style={{ color: '#86868B' }}>אין קריאות עדיין</p>
        ) : (
          tickets.map((t) => (
            <article
              key={t.id}
              style={{
                background: '#fff',
                borderRadius: 12,
                padding: 14,
                border: '1px solid #E8E8ED',
                marginBottom: 8,
              }}
            >
              <div style={{ fontWeight: 700 }}>#{t.ticket_number}</div>
              <div style={{ fontSize: 13, color: '#86868B' }}>
                {t.status}
                {t.scope ? ` · ${scopeLabel(t.scope)}` : ''}
              </div>
              <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{t.description}</p>
            </article>
          ))
        )}
      </section>
    </div>
  )
}

function scopeLabel(s: string) {
  if (s === 'common') return 'שטח משותף'
  if (s === 'private') return 'דירה פרטית'
  return 'לא ברור'
}
