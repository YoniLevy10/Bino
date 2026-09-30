'use client'

import { useEffect, useState } from 'react'
import {
  ResidentAlert,
  ResidentCard,
  ResidentMuted,
  ResidentPrimaryButton,
  ResidentSectionTitle,
  residentShellStyles,
  residentTheme,
} from '@/app/components/resident/residentUi'

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

  if (error) return <ResidentAlert tone="error">{error}</ResidentAlert>
  if (!data) return <ResidentMuted>טוען…</ResidentMuted>

  return (
    <div style={{ display: 'grid', gap: 14 }} className="resident-home-stack">
      <ResidentCard style={{ padding: '22px 20px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: residentTheme.colors.textMuted }}>
          יתרה לתשלום
        </div>
        <div style={{ ...residentShellStyles.balanceValue, marginTop: 6 }}>
          ₪{Number(data.openBalance || 0).toLocaleString('he-IL')}
        </div>
        {data.nextCharge ? (
          <div style={{ marginTop: 10, fontSize: 14, color: residentTheme.colors.textSecondary }}>
            החיוב הקרוב: {data.nextCharge.title}
            {data.nextCharge.due_date ? ` · עד ${data.nextCharge.due_date}` : ''}
          </div>
        ) : (
          <ResidentMuted style={{ marginTop: 10 }}>אין חיוב פתוח שפורסם</ResidentMuted>
        )}
        <div style={{ marginTop: 16 }}>
          <ResidentPrimaryButton href="/resident/payments">לתשלומים</ResidentPrimaryButton>
        </div>
      </ResidentCard>

      <ResidentCard>
        <ResidentSectionTitle>הודעה</ResidentSectionTitle>
        {data.pinnedAnnouncement ? (
          <>
            <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{data.pinnedAnnouncement.title}</div>
            <p style={{ margin: '8px 0 0', whiteSpace: 'pre-wrap', color: residentTheme.colors.textSecondary, lineHeight: 1.5 }}>
              {data.pinnedAnnouncement.body}
            </p>
          </>
        ) : (
          <ResidentMuted>אין הודעות שפורסמו כרגע</ResidentMuted>
        )}
      </ResidentCard>

      <ResidentCard>
        <ResidentSectionTitle>שעות מתקנים להיום</ResidentSectionTitle>
        {data.amenitiesToday.length === 0 ? (
          <ResidentMuted>לא פורסמו שעות מתקנים</ResidentMuted>
        ) : (
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>
            {data.amenitiesToday.map((a) => (
              <li key={a.id} style={{ marginBottom: 8, lineHeight: 1.4 }}>
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
      </ResidentCard>

      <ResidentPrimaryButton
        href="/resident/tickets"
        style={{
          background: 'linear-gradient(180deg, #3a3a4a 0%, #1A1A2E 46%, #12121f 100%)',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.25), inset 0 0 0 0.5px rgba(0,0,0,0.25)',
        }}
      >
        פתיחת תקלה
      </ResidentPrimaryButton>
    </div>
  )
}
