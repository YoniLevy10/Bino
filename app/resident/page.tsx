'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type HomePayload = {
  openBalance: number
  nextCharge: {
    id: string
    title: string
    amount: number
    due_date: string | null
    status: string
    can_pay: boolean
  } | null
  pinnedAnnouncement: { id: string; title: string; body: string } | null
  amenitiesToday: Array<{
    id: string
    name: string
    today: {
      is_closed: boolean
      opens_at: string | null
      closes_at: string | null
      source: string
    }
  }>
  error?: string
}

export default function ResidentHomePage() {
  const [data, setData] = useState<HomePayload | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/resident/home')
        const json = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setError(json.error || 'טעינה נכשלה')
          return
        }
        setData(json)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'שגיאת רשת')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <div role="alert" style={{ background: '#FFEBE9', color: '#FF3B30', padding: 16, borderRadius: 12 }}>
        {error}
      </div>
    )
  }
  if (!data) return <p style={{ color: '#86868B' }}>טוען…</p>

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section style={card}>
        <div style={{ fontSize: 13, color: '#86868B' }}>יתרה לתשלום</div>
        <div style={{ fontSize: 28, fontWeight: 800 }}>
          ₪{Number(data.openBalance || 0).toLocaleString('he-IL')}
        </div>
        {data.nextCharge ? (
          <div style={{ marginTop: 8, fontSize: 14 }}>
            החיוב הקרוב: {data.nextCharge.title}
            {data.nextCharge.due_date ? ` · עד ${data.nextCharge.due_date}` : ''}
          </div>
        ) : (
          <div style={{ marginTop: 8, fontSize: 14, color: '#86868B' }}>אין חיוב פתוח שפורסם</div>
        )}
        <Link href="/resident/payments" style={linkBtn}>
          לתשלומים
        </Link>
      </section>

      <section style={card}>
        <h2 style={h2}>הודעה</h2>
        {data.pinnedAnnouncement ? (
          <>
            <div style={{ fontWeight: 700 }}>{data.pinnedAnnouncement.title}</div>
            <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', color: '#3C3C43' }}>
              {data.pinnedAnnouncement.body}
            </p>
          </>
        ) : (
          <p style={{ margin: 0, color: '#86868B' }}>אין הודעות שפורסמו כרגע</p>
        )}
      </section>

      <section style={card}>
        <h2 style={h2}>שעות מתקנים להיום</h2>
        {data.amenitiesToday.length === 0 ? (
          <p style={{ margin: 0, color: '#86868B' }}>לא פורסמו שעות מתקנים</p>
        ) : (
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>
            {data.amenitiesToday.map((a) => (
              <li key={a.id} style={{ marginBottom: 6 }}>
                <strong>{a.name}</strong>:{' '}
                {a.today.source === 'none'
                  ? 'לא פורסמו שעות'
                  : a.today.is_closed
                    ? 'סגור'
                    : `${a.today.opens_at}–${a.today.closes_at}`}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link href="/resident/tickets" style={{ ...linkBtn, background: '#1A1A2E' }}>
        פתיחת תקלה
      </Link>
    </div>
  )
}

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  padding: 16,
  border: '1px solid #E8E8ED',
}
const h2: React.CSSProperties = { fontSize: 16, margin: '0 0 8px' }
const linkBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginTop: 12,
  minHeight: 48,
  padding: '0 16px',
  borderRadius: 12,
  background: '#007AFF',
  color: '#fff',
  textDecoration: 'none',
  fontWeight: 700,
}
