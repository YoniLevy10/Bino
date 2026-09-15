'use client'

import { useCallback, useEffect, useState } from 'react'
import { theme } from '@/app/components/ui'
import { LoadingButton } from '@/app/components/LoadingButton'
import { adminHeaders } from '@/app/superadmin/helpers'
import { ISRAEL_SALES_CITIES } from '@/lib/sales-leads/config'
import {
  contactabilityLabelHe,
  fitClassLabelHe,
  statusLabelHe,
} from '@/lib/sales-leads/fit-score'
import { whatsappLink } from '@/lib/sales-leads/phone'
import type { LeadStatus, SalesLead } from '@/lib/sales-leads/types'

type Counters = {
  total: number
  byStatus: Record<string, number>
  byFitClass: Record<string, number>
  byCity: Array<{ city: string; count: number }>
  bySegment: Array<{ segmentSlug: string; count: number }>
  pipelineMrrIls: number
  targetMrrIls: number
}

type RunRow = {
  id: string
  city: string
  status: string
  found_count: number
  created_count: number
  started_at: string
  error_message?: string | null
}

const QUICK_STATUSES: LeadStatus[] = [
  'qualified',
  'contacted',
  'demo_scheduled',
  'won',
  'lost',
  'do_not_contact',
]

export function SalesLeadsPanel({ secret }: { secret: string }) {
  const [leads, setLeads] = useState<SalesLead[]>([])
  const [total, setTotal] = useState(0)
  const [counters, setCounters] = useState<Counters | null>(null)
  const [runs, setRuns] = useState<RunRow[]>([])
  const [loading, setLoading] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [city, setCity] = useState('')
  const [status, setStatus] = useState('discovered,qualified,contacted,demo_scheduled')
  const [fitClass, setFitClass] = useState('suitable,needs_review')
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (city) params.set('city', city)
      if (status) params.set('status', status)
      if (fitClass) params.set('fitClass', fitClass)
      params.set('limit', '80')
      const res = await fetch(`/api/superadmin/sales-leads?${params}`, {
        headers: adminHeaders(secret),
      })
      const json = (await res.json()) as {
        leads?: SalesLead[]
        total?: number
        counters?: Counters
        runs?: RunRow[]
        error?: string
      }
      if (!res.ok) throw new Error(json.error || 'טעינה נכשלה')
      setLeads(json.leads ?? [])
      setTotal(json.total ?? 0)
      setCounters(json.counters ?? null)
      setRuns(json.runs ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setLoading(false)
    }
  }, [secret, q, city, status, fitClass])

  useEffect(() => {
    void load()
  }, [load])

  async function runDiscover() {
    setDiscovering(true)
    setError('')
    try {
      const res = await fetch('/api/superadmin/sales-leads/discover', {
        method: 'POST',
        headers: { ...adminHeaders(secret), 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: city || undefined }),
      })
      const json = (await res.json()) as { error?: string; status?: string; created?: number; city?: string }
      if (!res.ok && json.status !== 'busy') {
        throw new Error(json.error || 'גילוי נכשל')
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setDiscovering(false)
    }
  }

  async function setLeadStatus(id: string, next: LeadStatus) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/superadmin/sales-leads/${id}`, {
        method: 'PATCH',
        headers: { ...adminHeaders(secret), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      const json = (await res.json()) as { lead?: SalesLead; error?: string }
      if (!res.ok) throw new Error(json.error || 'עדכון נכשל')
      if (json.lead) {
        setLeads((prev) => prev.map((l) => (l.id === id ? json.lead! : l)))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusyId(null)
    }
  }

  const progressPct = counters
    ? Math.min(100, Math.round((counters.pipelineMrrIls / counters.targetMrrIls) * 100))
    : 0

  return (
    <div className="sa-tab-panel" dir="rtl">
      <section className="sa-panel" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>סוכן לידים · יעד ₪100,000 MRR</h2>
        <p className="sa-muted" style={{ marginTop: 8 }}>
          סריקה יומית בישראל (Google Places + OSM) — לא רק חברות אחזקה: ניהול נכסים,
          מתקנים, ועדים, דיור מוגן, מעונות, יזמים, מתחמים ועוד. פנייה מהירה עם זווית מכירה.
        </p>
        {counters ? (
          <div className="sa-leads-kpis">
            <div>
              <strong>{counters.total}</strong>
              <span>לידים במאגר</span>
            </div>
            <div>
              <strong>₪{counters.pipelineMrrIls.toLocaleString('he-IL')}</strong>
              <span>MRR בצנרת (הערכה)</span>
            </div>
            <div>
              <strong>{progressPct}%</strong>
              <span>מול יעד 100K</span>
            </div>
            <div>
              <strong>{counters.byFitClass.suitable ?? 0}</strong>
              <span>מתאימים</span>
            </div>
          </div>
        ) : null}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          <LoadingButton
            type="button"
            loading={discovering}
            className="sa-btn sa-btn-primary"
            onClick={() => void runDiscover()}
          >
            הרץ גילוי עכשיו
          </LoadingButton>
          <LoadingButton
            type="button"
            loading={loading}
            className="sa-btn sa-btn-ghost"
            onClick={() => void load()}
          >
            רענון
          </LoadingButton>
        </div>
      </section>

      {error ? <div className="sa-banner sa-banner-error">{error}</div> : null}

      <section className="sa-panel" style={{ marginBottom: 16 }}>
        <div className="sa-leads-filters">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש שם / טלפון"
          />
          <select value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">כל הערים</option>
            {ISRAEL_SALES_CITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="discovered,qualified,contacted,demo_scheduled">פעילים</option>
            <option value="discovered">חדשים</option>
            <option value="contacted">פנינו</option>
            <option value="demo_scheduled">דמו</option>
            <option value="won">נסגרו</option>
            <option value="">הכל</option>
          </select>
          <select value={fitClass} onChange={(e) => setFitClass(e.target.value)}>
            <option value="suitable,needs_review">מתאים + לבדיקה</option>
            <option value="suitable">מתאים בלבד</option>
            <option value="">כל הדירוגים</option>
          </select>
        </div>
        <p className="sa-muted" style={{ marginTop: 8 }}>
          מציג {leads.length} מתוך {total}
        </p>
      </section>

      <div className="sa-leads-list">
        {leads.map((lead) => {
          const wa = whatsappLink(
            lead.whatsappPhone || lead.phone,
            `שלום מ-${lead.businessName || lead.name}, רציתי להציג את BINO — מערכת זיכרון תפעולי לבניינים שחוסכת זמן וכסף בניהול תקלות.`,
          )
          return (
            <article key={lead.id} className="sa-lead-card">
              <header>
                <h3>{lead.businessName || lead.name}</h3>
                <span className="sa-lead-badge">
                  {fitClassLabelHe(lead.fitClass)} · {lead.fitScore ?? '—'}
                </span>
              </header>
              <p className="sa-muted">
                {lead.city} · {lead.segmentSlug} · {statusLabelHe(lead.status)} ·{' '}
                {contactabilityLabelHe(lead.contactability)}
              </p>
              {lead.outreachAngle ? (
                <p className="sa-lead-angle">{lead.outreachAngle}</p>
              ) : null}
              <p className="sa-muted" style={{ fontSize: 13 }}>
                {lead.phone || 'אין טלפון'}
                {lead.estimatedMrrIls
                  ? ` · הערכת MRR ₪${lead.estimatedMrrIls}`
                  : ''}
              </p>
              <div className="sa-lead-actions">
                {wa ? (
                  <a
                    className="sa-btn sa-btn-primary"
                    href={wa}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => {
                      if (lead.status === 'discovered' || lead.status === 'qualified') {
                        void setLeadStatus(lead.id, 'contacted')
                      }
                    }}
                  >
                    WhatsApp
                  </a>
                ) : null}
                {lead.websiteUrl ? (
                  <a
                    className="sa-btn sa-btn-ghost"
                    href={lead.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    אתר
                  </a>
                ) : null}
                {QUICK_STATUSES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    className="sa-btn sa-btn-ghost"
                    disabled={busyId === lead.id || lead.status === st}
                    onClick={() => void setLeadStatus(lead.id, st)}
                  >
                    {statusLabelHe(st)}
                  </button>
                ))}
              </div>
            </article>
          )
        })}
        {!loading && leads.length === 0 ? (
          <p className="sa-muted">אין לידים עדיין — הריצו גילוי או המתינו לקרון היומי.</p>
        ) : null}
      </div>

      {runs.length > 0 ? (
        <section className="sa-panel" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>ריצות אחרונות</h3>
          <ul className="sa-runs">
            {runs.map((r) => (
              <li key={r.id}>
                {new Date(r.started_at).toLocaleString('he-IL')} · {r.city} · {r.status} ·
                נמצאו {r.found_count} · נוצרו {r.created_count}
                {r.error_message ? ` · ${r.error_message}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <style jsx>{`
        .sa-leads-kpis {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 12px;
          margin-top: 12px;
        }
        .sa-leads-kpis div {
          background: ${theme.colors.background};
          border: 1px solid ${theme.colors.border};
          border-radius: 10px;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .sa-leads-kpis strong {
          font-size: 18px;
          color: ${theme.colors.textPrimary};
        }
        .sa-leads-kpis span {
          font-size: 12px;
          color: ${theme.colors.textSecondary};
        }
        .sa-leads-filters {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 8px;
        }
        .sa-leads-filters input,
        .sa-leads-filters select {
          width: 100%;
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid ${theme.colors.border};
          background: ${theme.colors.surface};
        }
        .sa-leads-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .sa-lead-card {
          border: 1px solid ${theme.colors.border};
          border-radius: 12px;
          padding: 12px 14px;
          background: ${theme.colors.surface};
        }
        .sa-lead-card header {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          align-items: flex-start;
        }
        .sa-lead-card h3 {
          margin: 0;
          font-size: 16px;
        }
        .sa-lead-badge {
          font-size: 12px;
          white-space: nowrap;
          color: ${theme.colors.primary};
        }
        .sa-lead-angle {
          margin: 8px 0;
          font-size: 14px;
          color: ${theme.colors.textPrimary};
        }
        .sa-lead-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 10px;
        }
        .sa-runs {
          margin: 0;
          padding-inline-start: 18px;
          color: ${theme.colors.textSecondary};
          font-size: 13px;
        }
      `}</style>
    </div>
  )
}
