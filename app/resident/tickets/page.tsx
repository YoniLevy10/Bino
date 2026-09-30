'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { residentMidragSearchHref, residentMidragSectors } from '@/lib/resident-portal/midrag'
import {
  ResidentAlert,
  ResidentCard,
  ResidentMuted,
  ResidentPageTitle,
  ResidentPrimaryButton,
  ResidentSectionTitle,
  ResidentSelect,
  ResidentTextArea,
  residentShellStyles,
  residentTheme,
} from '@/app/components/resident/residentUi'

type Ticket = {
  id: string
  ticket_number: number
  status: string
  description: string | null
  scope: string | null
  opened_at: string | null
  closed_at: string | null
}

const SECTORS = residentMidragSectors()

export default function ResidentTicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [description, setDescription] = useState('')
  const [scope, setScope] = useState<'common' | 'private' | 'unclear'>('unclear')
  const [sectorId, setSectorId] = useState<number>(SECTORS[0]?.sectorId ?? 4)
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
          sector_id: sectorId,
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

  const midrag = residentMidragSearchHref({ sectorId, city })

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <ResidentPageTitle>התקלות שלי</ResidentPageTitle>

      <form onSubmit={onSubmit}>
        <ResidentCard>
          <ResidentSectionTitle>פתיחת תקלה</ResidentSectionTitle>
          <label style={residentShellStyles.label}>תיאור</label>
          <ResidentTextArea
            required
            minLength={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
          />
          <label style={{ ...residentShellStyles.label, marginTop: 10 }}>סוג</label>
          <ResidentSelect
            value={scope}
            onChange={(e) => setScope(e.target.value as typeof scope)}
            style={{ marginBottom: 10 }}
          >
            <option value="common">שטח משותף</option>
            <option value="private">דירה פרטית</option>
            <option value="unclear">לא ברור</option>
          </ResidentSelect>
          {scope === 'private' ? (
            <div style={{ marginBottom: 10 }}>
              <label style={residentShellStyles.label}>מקצוע לחיפוש במידרג</label>
              <ResidentSelect
                value={sectorId}
                onChange={(e) => setSectorId(Number(e.target.value))}
              >
                {SECTORS.map((s) => (
                  <option key={s.sectorId} value={s.sectorId}>
                    {s.label}
                  </option>
                ))}
              </ResidentSelect>
              <ResidentMuted style={{ margin: '8px 0' }}>
                תקלה פרטית אינה משובצת אוטומטית. פתיחת מידרג אינה הזמנה.
              </ResidentMuted>
              {midrag.href ? (
                <a
                  href={midrag.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: residentTheme.colors.primary, fontWeight: 600 }}
                >
                  {midrag.needsCityPicker
                    ? 'בחירת עיר במידרג'
                    : `חיפוש במידרג (${city})`}
                </a>
              ) : null}
            </div>
          ) : null}
          {error ? <div style={{ marginBottom: 8 }}><ResidentAlert tone="error">{error}</ResidentAlert></div> : null}
          {success ? <div style={{ marginBottom: 8 }}><ResidentAlert tone="success">{success}</ResidentAlert></div> : null}
          <ResidentPrimaryButton type="submit" disabled={loading}>
            {loading ? 'שולח…' : 'פתיחת קריאה'}
          </ResidentPrimaryButton>
        </ResidentCard>
      </form>

      <section style={{ display: 'grid', gap: 10 }}>
        <ResidentSectionTitle>הקריאות שלי</ResidentSectionTitle>
        {tickets.length === 0 ? (
          <ResidentMuted>אין קריאות עדיין</ResidentMuted>
        ) : (
          tickets.map((t) => (
            <ResidentCard key={t.id} style={{ padding: 14 }}>
              <div style={{ fontWeight: 700 }}>#{t.ticket_number}</div>
              <div style={{ fontSize: 13, color: residentTheme.colors.textMuted }}>
                {t.status}
                {t.scope ? ` · ${scopeLabel(t.scope)}` : ''}
              </div>
              <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap' }}>{t.description}</p>
            </ResidentCard>
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
