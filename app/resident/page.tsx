'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { fetchWithTimeout } from '@/lib/shared/fetch-with-timeout'
import { useIsMobile } from '@/lib/hooks/use-is-mobile'
import {
  ResidentAlert,
  ResidentMuted,
  ResidentPrimaryButton,
  residentShellStyles,
} from '@/app/components/resident/residentUi'

type HomePayload = {
  membership?: {
    id: string
    client_name: string | null
    project_name: string | null
    apartment_number: string | null
  }
  openBalance: number
  nextCharge: {
    id: string
    title: string
    amount: number
    due_date: string | null
    status: string
    can_pay: boolean
  } | null
  pendingApprovals?: number
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

const QUICK_ACTIONS = [
  { href: '/resident/tickets', label: 'פתיחת תקלה', hint: 'דיווח מהיר', badgeKey: null },
  { href: '/resident/payments', label: 'תשלומים', hint: 'יתרות וחיובים', badgeKey: null },
  { href: '/resident/decisions', label: 'אישורים', hint: 'חתימות והצבעה', badgeKey: 'approvals' as const },
  { href: '/resident/information', label: 'מידע', hint: 'הודעות ומסמכים', badgeKey: null },
] as const

function amenityHours(a: HomePayload['amenitiesToday'][number]): string {
  if (a.today.source === 'none') return 'לא פורסמו שעות'
  if (a.today.is_closed) return 'סגור'
  return `${a.today.opens_at}–${a.today.closes_at}`
}

export default function ResidentHomePage() {
  const isMobile = useIsMobile()
  const [data, setData] = useState<HomePayload | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        let res = await fetchWithTimeout('/api/resident/home')
        // Soft-nav after login can race cookies; one short retry.
        if (res.status === 401) {
          await new Promise((r) => setTimeout(r, 250))
          if (cancelled) return
          res = await fetchWithTimeout('/api/resident/home')
        }
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

  const apartment = data.membership?.apartment_number
  const building = data.membership?.project_name
  const balance = Number(data.openBalance || 0)
  const pendingApprovals = Math.max(0, Number(data.pendingApprovals || 0))

  return (
    <div className={`resident-home ${isMobile ? 'is-mobile' : 'is-desktop'}`}>
      <section className="resident-home-hero" aria-labelledby="resident-home-balance-label">
        <p className="resident-home-kicker">אזור אישי</p>
        <h1 className="resident-home-greeting" id="resident-home-title">
          {apartment ? `דירה ${apartment}` : 'הבית שלכם'}
          {building ? <span className="resident-home-greeting-sub">{building}</span> : null}
        </h1>

        <div className="resident-home-balance">
          <div id="resident-home-balance-label" className="resident-home-balance-label">
            יתרה לתשלום
          </div>
          <div className="resident-home-balance-value" style={residentShellStyles.balanceValue}>
            ₪{balance.toLocaleString('he-IL')}
          </div>
          {data.nextCharge ? (
            <p className="resident-home-balance-meta">
              החיוב הקרוב: {data.nextCharge.title}
              {data.nextCharge.due_date ? ` · עד ${data.nextCharge.due_date}` : ''}
            </p>
          ) : (
            <p className="resident-home-balance-meta muted">אין חיוב פתוח שפורסם</p>
          )}
          <div className="resident-home-balance-cta">
            <ResidentPrimaryButton href="/resident/payments">לתשלומים</ResidentPrimaryButton>
          </div>
        </div>
      </section>

      {pendingApprovals > 0 ? (
        <Link
          href="/resident/decisions"
          className="resident-home-approvals-banner resident-btn-press"
          aria-label={`${pendingApprovals} אישורים ממתינים לחתימה`}
        >
          <span className="resident-home-approvals-banner-label">אישורים ממתינים</span>
          <span className="resident-home-approvals-banner-count">
            {pendingApprovals > 99 ? '99+' : pendingApprovals}
          </span>
        </Link>
      ) : null}

      <nav className="resident-home-actions" aria-label="פעולות מהירות">
        {QUICK_ACTIONS.map((action) => {
          const showBadge = action.badgeKey === 'approvals' && pendingApprovals > 0
          return (
            <Link
              key={action.href}
              href={action.href}
              className="resident-home-action resident-btn-press"
              aria-label={
                showBadge
                  ? `${action.label} — ${pendingApprovals} ממתינים`
                  : undefined
              }
            >
              <span className="resident-home-action-label-row">
                <span className="resident-home-action-label">{action.label}</span>
                {showBadge ? (
                  <span className="resident-home-action-badge">
                    {pendingApprovals > 99 ? '99+' : pendingApprovals}
                  </span>
                ) : null}
              </span>
              <span className="resident-home-action-hint">
                {showBadge ? `${pendingApprovals} ממתינים לחתימה` : action.hint}
              </span>
            </Link>
          )
        })}
      </nav>

      <div className="resident-home-secondary">
        <section className="resident-home-section" aria-labelledby="resident-home-announcement">
          <h2 id="resident-home-announcement" className="resident-home-section-title">
            הודעה
          </h2>
          {data.pinnedAnnouncement ? (
            <>
              <div className="resident-home-announcement-title">{data.pinnedAnnouncement.title}</div>
              <p className="resident-home-announcement-body">{data.pinnedAnnouncement.body}</p>
            </>
          ) : (
            <ResidentMuted>אין הודעות שפורסמו כרגע</ResidentMuted>
          )}
        </section>

        <section className="resident-home-section" aria-labelledby="resident-home-amenities">
          <h2 id="resident-home-amenities" className="resident-home-section-title">
            שעות מתקנים להיום
          </h2>
          {data.amenitiesToday.length === 0 ? (
            <ResidentMuted>לא פורסמו שעות מתקנים</ResidentMuted>
          ) : (
            <ul className="resident-home-amenity-list">
              {data.amenitiesToday.map((a) => (
                <li key={a.id}>
                  <span className="resident-home-amenity-name">{a.name}</span>
                  <span className="resident-home-amenity-hours">{amenityHours(a)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
