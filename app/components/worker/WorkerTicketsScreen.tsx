'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { isTicketInTreatment } from '@/lib/ticket-status'
import { PageTransitionLoader } from '../page-skeleton'
import { theme } from '../ui'
import type { WorkerTicketCardTicket } from './WorkerTicketCard'

type TicketFilter = 'ALL' | 'NEW' | 'IN_TREATMENT'

type WorkerTicketsScreenProps = {
  tickets: WorkerTicketCardTicket[]
  loading: boolean
  logoUrl?: string | null
  colors: typeof theme.colors
  pushOnboarding?: ReactNode
  renderTicket: (ticket: WorkerTicketCardTicket) => ReactNode
}

export function WorkerTicketsScreen({
  tickets,
  loading,
  logoUrl,
  colors,
  pushOnboarding,
  renderTicket,
}: WorkerTicketsScreenProps) {
  const [filter, setFilter] = useState<TicketFilter>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  const newCount = useMemo(
    () => tickets.filter((ticket) => ticket.status === 'NEW' || ticket.status === 'ASSIGNED').length,
    [tickets]
  )
  const inTreatmentCount = useMemo(
    () => tickets.filter((ticket) => isTicketInTreatment(ticket.status)).length,
    [tickets]
  )
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase('he-IL')
  const visibleTickets = useMemo(
    () =>
      tickets.filter((ticket) => {
        const matchesFilter =
          filter === 'ALL' ||
          (filter === 'NEW' && (ticket.status === 'NEW' || ticket.status === 'ASSIGNED')) ||
          (filter === 'IN_TREATMENT' && isTicketInTreatment(ticket.status))

        if (!matchesFilter || !normalizedQuery) return matchesFilter

        const searchableText = [
          String(ticket.ticket_number),
          ticket.description,
          ticket.project_name,
          ticket.project_address,
          ticket.building_number,
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('he-IL')

        return searchableText.includes(normalizedQuery)
      }),
    [tickets, filter, normalizedQuery]
  )

  const filters: { id: TicketFilter; label: string; count: number }[] = [
    { id: 'ALL', label: 'הכול', count: tickets.length },
    { id: 'NEW', label: 'חדש', count: newCount },
    { id: 'IN_TREATMENT', label: 'בטיפול', count: inTreatmentCount },
  ]
  const hasActiveFilter = filter !== 'ALL' || !!normalizedQuery

  return (
    <section className="worker-ticket-screen" dir="rtl" aria-labelledby="worker-ticket-title">
      <header className="worker-ticket-screen__hero">
        <p className="worker-ticket-screen__eyebrow" style={{ color: colors.textMuted }}>לוח עבודה</p>
        <div className="worker-ticket-screen__title-row">
          <h2
            id="worker-ticket-title"
            className="worker-ticket-screen__title"
            style={{ color: colors.textPrimary }}
          >
            התקלות שלי
          </h2>
          <span
            className="worker-ticket-screen__total"
            style={{ background: colors.primaryMuted, color: colors.primary }}
          >
            {tickets.length} פתוחות
          </span>
        </div>
        <p className="worker-ticket-screen__description" style={{ color: colors.textSecondary }}>
          פתחו תקלה לעדכון סטטוס, שיחה או הוספת תמונה.
        </p>
      </header>

      <div
        className="worker-ticket-screen__search lg-glass"
        style={{ borderColor: colors.border, background: colors.surface, color: colors.textPrimary }}
      >
        <label className="sr-only" htmlFor="worker-ticket-search">
          חיפוש לפי מספר תקלה, תיאור או מיקום
        </label>
        <svg
          className="worker-ticket-screen__search-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke={colors.textMuted}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
        <input
          id="worker-ticket-search"
          type="search"
          className="worker-ticket-screen__search-input"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="חיפוש תקלה או מיקום"
          autoComplete="off"
          dir="auto"
        />
        {searchQuery ? (
          <button
            type="button"
            className="worker-ticket-screen__clear-search"
            onClick={() => setSearchQuery('')}
            aria-label="ניקוי החיפוש"
            style={{ color: colors.textMuted }}
          >
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
      </div>

      <div className="worker-ticket-screen__filters" role="group" aria-label="סינון תקלות">
        {filters.map((item) => {
          const selected = filter === item.id
          return (
            <button
              key={item.id}
              type="button"
              className={`worker-ticket-screen__filter${selected ? ' is-active' : ''}`}
              style={
                selected
                  ? { background: colors.primaryMuted, borderColor: colors.primary, color: colors.primary }
                  : { background: colors.surface, borderColor: colors.border, color: colors.textSecondary }
              }
              onClick={() => setFilter(item.id)}
              aria-pressed={selected}
            >
              <span>{item.label}</span>
              <span
                className="worker-ticket-screen__filter-count"
                style={
                  selected
                    ? { background: colors.surface, color: colors.primary }
                    : { background: colors.muted, color: colors.textMuted }
                }
              >
                {item.count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="worker-ticket-screen__list-heading">
        <h3 style={{ color: colors.textPrimary }}>רשימת תקלות</h3>
        <span className="worker-ticket-screen__result-count" style={{ color: colors.textMuted }} aria-live="polite">
          <bdi>{visibleTickets.length}</bdi>
          <span>{visibleTickets.length === 1 ? 'תקלה' : 'תקלות'}</span>
        </span>
      </div>

      {loading ? (
        <div className="worker-ticket-screen__loading" role="status" aria-label="טוען תקלות">
          <PageTransitionLoader compact logoUrl={logoUrl} />
        </div>
      ) : visibleTickets.length ? (
        <div className="worker-ticket-screen__list" role="list">
          {visibleTickets.map((ticket) => (
            <div key={ticket.id} role="listitem">
              {renderTicket(ticket)}
            </div>
          ))}
        </div>
      ) : (
        <section
          className="worker-ticket-screen__empty"
          style={{ background: colors.surface, borderColor: colors.border }}
          role="status"
        >
          <span
            className="worker-ticket-screen__empty-icon"
            style={{ background: colors.primaryMuted, color: colors.primary }}
            aria-hidden="true"
          >
            {tickets.length === 0 ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m5 12 4 4L19 6" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
              </svg>
            )}
          </span>
          <h3 style={{ color: colors.textPrimary }}>
            {tickets.length === 0 ? 'אין תקלות פתוחות' : 'לא נמצאו תקלות תואמות'}
          </h3>
          <p style={{ color: colors.textSecondary }}>
            {tickets.length === 0
              ? 'כשתשויך אליך תקלה חדשה, היא תופיע כאן.'
              : 'אפשר לשנות את הסינון או לנסות מילות חיפוש אחרות.'}
          </p>
          {hasActiveFilter ? (
            <button
              type="button"
              className="worker-ticket-screen__reset"
              onClick={() => {
                setFilter('ALL')
                setSearchQuery('')
              }}
              style={{ background: colors.primaryMuted, color: colors.primary }}
            >
              ניקוי חיפוש וסינון
            </button>
          ) : null}
        </section>
      )}

      {pushOnboarding ? <div className="worker-ticket-screen__notice">{pushOnboarding}</div> : null}
    </section>
  )
}
