'use client'

import { theme } from '@/app/components/ui'
import { effectiveLimitsForClient } from '../helpers'
import type { ClientFilter, ClientRow, PlanCatalogRow } from '../types'
import { PLAN_COLORS, PLAN_LABELS } from '../types'

const FILTERS: { id: ClientFilter; label: string }[] = [
  { id: 'all', label: 'הכל' },
  { id: 'open_tickets', label: 'קריאות פתוחות' },
  { id: 'no_whatsapp', label: 'ללא WhatsApp' },
  { id: 'at_worker_limit', label: 'מכסת עובדים' },
]

export function ClientsList({
  clients,
  filtered,
  catalog,
  loading,
  search,
  filter,
  totalOpenTickets,
  opsBadge,
  onSearch,
  onFilter,
  onOpenClient,
}: {
  clients: ClientRow[]
  filtered: ClientRow[]
  catalog: PlanCatalogRow[]
  loading: boolean
  search: string
  filter: ClientFilter
  totalOpenTickets: number
  opsBadge: number
  onSearch: (q: string) => void
  onFilter: (f: ClientFilter) => void
  onOpenClient: (id: string) => void
}) {
  return (
    <div className="sa-clients-view">
      <div className="sa-stats-row">
        <div className="sa-stat-chip">
          <strong>{clients.length}</strong>
          <span>לקוחות</span>
        </div>
        <div className="sa-stat-chip">
          <strong>{totalOpenTickets}</strong>
          <span>קריאות פתוחות</span>
        </div>
        <div className="sa-stat-chip sa-stat-chip--desktop">
          <strong>{opsBadge}</strong>
          <span>שגיאות תפעול</span>
        </div>
      </div>

      <div className="sa-search-sticky">
        <input
          type="search"
          className="sa-input"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="חיפוש לפי שם, מייל, טלפון…"
          aria-label="חיפוש לקוחות"
        />
        <div className="sa-filter-chips">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`sa-filter-chip${filter === f.id ? ' is-active' : ''}`}
              onClick={() => onFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
          {(search || filter !== 'all') && (
            <span className="sa-filter-count">
              {filtered.length}/{clients.length}
            </span>
          )}
        </div>
      </div>

      {loading && clients.length === 0 ? (
        <p className="sa-empty">טוען…</p>
      ) : filtered.length === 0 ? (
        <p className="sa-empty">{clients.length === 0 ? 'אין לקוחות' : 'אין תוצאות'}</p>
      ) : (
        <div className="sa-client-cards">
          {filtered.map((c) => {
            const limits = effectiveLimitsForClient(c, catalog)
            const atWorkerLimit =
              limits.workers != null && c.workers_active_count >= limits.workers
            const planColor = PLAN_COLORS[c.plan_tier] ?? '#6b7280'
            return (
              <article key={c.id} className="sa-client-card">
                <button
                  type="button"
                  className="sa-client-card-main"
                  onClick={() => onOpenClient(c.id)}
                >
                  <div className="sa-client-card-top">
                    <h3>{c.name}</h3>
                    <span className="sa-plan-pill" style={{ background: planColor }}>
                      {PLAN_LABELS[c.plan_tier] ?? c.plan_tier}
                    </span>
                  </div>
                  <div className="sa-client-card-meta">
                    <span>{c.buildings_count} בניינים</span>
                    <span>·</span>
                    <span style={{ color: c.open_tickets_count > 0 ? theme.colors.warning : undefined }}>
                      {c.open_tickets_count} קריאות
                    </span>
                  </div>
                  <div className="sa-client-card-alerts">
                    <span className={`sa-dot${c.whatsapp_phone_number_id ? ' is-ok' : ' is-bad'}`} />
                    <span>{c.whatsapp_phone_number_id ? 'WhatsApp מחובר' : 'ללא WhatsApp'}</span>
                    {atWorkerLimit ? <span className="sa-alert-pill">מכסת עובדים</span> : null}
                    {c.open_tickets_count > 0 ? (
                      <span className="sa-alert-pill sa-alert-pill--warn">יש קריאות</span>
                    ) : null}
                  </div>
                </button>
                <div className="sa-client-card-actions">
                  {c.manager_phone ? (
                    <a className="sa-quick-btn" href={`tel:${c.manager_phone}`}>
                      התקשר
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="sa-quick-btn sa-quick-btn--primary"
                    onClick={() => onOpenClient(c.id)}
                  >
                    פתח
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
