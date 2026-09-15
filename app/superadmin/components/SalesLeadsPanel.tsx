'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { theme } from '@/app/components/ui'
import { LoadingButton } from '@/app/components/LoadingButton'
import { adminHeaders } from '@/app/superadmin/helpers'
import {
  CORE_SALES_SEGMENT_SLUGS,
  ISRAEL_SALES_CITIES,
  segmentLabelHe,
} from '@/lib/sales-leads/config'
import {
  contactabilityLabelHe,
  fitClassLabelHe,
  statusLabelHe,
} from '@/lib/sales-leads/fit-score'
import { whatsappLink } from '@/lib/sales-leads/phone'
import { LEAD_STATUSES, type LeadStatus, type SalesLead } from '@/lib/sales-leads/types'

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
  found_count?: number
  created_count?: number
  started_at: string
  error_message?: string | null
}

type SortMode = 'fit_score' | 'created_at' | 'estimated_mrr'

const STATUS_CHIPS: Array<{ value: string; label: string }> = [
  { value: 'discovered,qualified,contacted,demo_scheduled', label: 'פעילים' },
  { value: 'discovered', label: 'חדשים' },
  { value: 'qualified', label: 'מסוננים' },
  { value: 'contacted', label: 'פנינו' },
  { value: 'demo_scheduled', label: 'דמו' },
  { value: 'won', label: 'נסגרו' },
  { value: 'lost,rejected,do_not_contact', label: 'סגורים' },
  { value: '', label: 'הכל' },
]

const FIT_CHIPS: Array<{ value: string; label: string }> = [
  { value: 'suitable,needs_review', label: 'מתאים + לבדיקה' },
  { value: 'suitable', label: 'מתאים בלבד' },
  { value: 'needs_review', label: 'לבדיקה' },
  { value: '', label: 'כל הדירוגים' },
]

const QUICK_STATUSES: LeadStatus[] = [
  'qualified',
  'contacted',
  'demo_scheduled',
  'won',
  'lost',
  'do_not_contact',
]

function waMessage(lead: SalesLead): string {
  const who = lead.businessName || lead.name
  const angle =
    lead.outreachAngle ||
    'זיכרון תפעולי לבניינים — שיוך אוטומטי, SLA, תקלות חוזרות והוכחת חיסכון'
  return `שלום, כאן מ-BINO.\nראיתי את ${who} וחשבתי שזה יכול לעניין אתכם:\n${angle}\n\nאפשר לקבוע דמו קצר של 15 דקות?`
}

function fitTone(score: number | null | undefined): string {
  if (score == null) return theme.colors.textSecondary
  if (score >= 75) return '#15803d'
  if (score >= 60) return theme.colors.primary
  if (score >= 40) return '#b45309'
  return '#b91c1c'
}

function rankStars(score: number | null | undefined): string {
  if (score == null) return '☆☆☆☆☆'
  if (score >= 85) return '★★★★★'
  if (score >= 70) return '★★★★☆'
  if (score >= 55) return '★★★☆☆'
  if (score >= 40) return '★★☆☆☆'
  return '★☆☆☆☆'
}

export function SalesLeadsPanel({ secret }: { secret: string }) {
  const [leads, setLeads] = useState<SalesLead[]>([])
  const [total, setTotal] = useState(0)
  const [counters, setCounters] = useState<Counters | null>(null)
  const [runs, setRuns] = useState<RunRow[]>([])
  const [loading, setLoading] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const [discoverPct, setDiscoverPct] = useState(0)
  const [discoverPhase, setDiscoverPhase] = useState('')
  const [discoverFound, setDiscoverFound] = useState(0)
  const [discoverCreated, setDiscoverCreated] = useState(0)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')

  const [q, setQ] = useState('')
  const [qDraft, setQDraft] = useState('')
  const [city, setCity] = useState('')
  const [segment, setSegment] = useState('')
  const [status, setStatus] = useState('discovered,qualified,contacted,demo_scheduled')
  const [fitClass, setFitClass] = useState('suitable,needs_review')
  const [contactability, setContactability] = useState('mobile,landline,unknown')
  const [minFitScore, setMinFitScore] = useState(0)
  const [sort, setSort] = useState<SortMode>('fit_score')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (city) params.set('city', city)
      if (segment) params.set('segment', segment)
      if (status) params.set('status', status)
      if (fitClass) params.set('fitClass', fitClass)
      if (contactability) params.set('contactability', contactability)
      if (minFitScore > 0) params.set('minFitScore', String(minFitScore))
      params.set('sort', sort)
      params.set('limit', '100')

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
      setSelected(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setLoading(false)
    }
  }, [secret, q, city, segment, status, fitClass, contactability, minFitScore, sort])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const t = setTimeout(() => setQ(qDraft), 350)
    return () => clearTimeout(t)
  }, [qDraft])

  const progressPct = counters
    ? Math.min(
        100,
        Math.round((counters.pipelineMrrIls / Math.max(1, counters.targetMrrIls)) * 100),
      )
    : 0

  const allSelected = leads.length > 0 && selected.size === leads.length

  function toggleAll() {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(leads.map((l) => l.id)))
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function runDiscover() {
    setDiscovering(true)
    setDiscoverPct(1)
    setDiscoverPhase('מתחיל גילוי…')
    setDiscoverFound(0)
    setDiscoverCreated(0)
    setError('')
    setOkMsg('')

    let pollTimer: ReturnType<typeof setInterval> | null = null
    const pollProgress = async () => {
      try {
        const res = await fetch('/api/superadmin/sales-leads/discover', {
          headers: adminHeaders(secret),
        })
        if (!res.ok) return
        const json = (await res.json()) as {
          status?: string | null
          found?: number
          created?: number
          progress?: {
            progressPct?: number
            phase?: string
            found?: number
            created?: number
          } | null
        }
        const pct = json.progress?.progressPct
        if (typeof pct === 'number') {
          setDiscoverPct((prev) => Math.max(prev, Math.min(99, pct)))
        }
        if (json.progress?.phase) setDiscoverPhase(json.progress.phase)
        if (typeof json.progress?.found === 'number') setDiscoverFound(json.progress.found)
        else if (typeof json.found === 'number') setDiscoverFound(json.found)
        if (typeof json.progress?.created === 'number') setDiscoverCreated(json.progress.created)
        else if (typeof json.created === 'number') setDiscoverCreated(json.created)
      } catch {
        /* ignore poll errors while discover runs */
      }
    }

    pollTimer = setInterval(() => {
      void pollProgress()
      setDiscoverPct((prev) => (prev < 90 ? Math.min(90, prev + 0.4) : prev))
    }, 1200)
    void pollProgress()

    try {
      const res = await fetch('/api/superadmin/sales-leads/discover', {
        method: 'POST',
        headers: { ...adminHeaders(secret), 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: city || undefined }),
      })
      const json = (await res.json()) as {
        error?: string
        status?: string
        created?: number
        found?: number
        errorMessage?: string
      }
      if (!res.ok && json.status !== 'busy') {
        throw new Error(json.error || json.errorMessage || 'גילוי נכשל')
      }
      setDiscoverPct(100)
      setDiscoverPhase(json.status === 'busy' ? 'ריצה כבר פעילה' : 'הושלם')
      setDiscoverFound(json.found ?? 0)
      setDiscoverCreated(json.created ?? 0)
      setOkMsg(
        json.status === 'busy'
          ? 'ריצה כבר פעילה — נסו שוב בעוד דקה'
          : `גילוי הסתיים · נמצאו ${json.found ?? 0} · נוצרו ${json.created ?? 0}`,
      )
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
      setDiscoverPhase('נכשל')
    } finally {
      if (pollTimer) clearInterval(pollTimer)
      setTimeout(() => {
        setDiscovering(false)
        setDiscoverPct(0)
        setDiscoverPhase('')
      }, 900)
    }
  }

  async function patchStatus(id: string, next: LeadStatus) {
    setBusyId(id)
    setError('')
    try {
      const res = await fetch(`/api/superadmin/sales-leads/${id}`, {
        method: 'PATCH',
        headers: { ...adminHeaders(secret), 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      })
      const json = (await res.json()) as { lead?: SalesLead; error?: string }
      if (!res.ok) throw new Error(json.error || 'עדכון נכשל')
      if (json.lead) setLeads((prev) => prev.map((l) => (l.id === id ? json.lead! : l)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusyId(null)
    }
  }

  async function openWhatsapp(lead: SalesLead) {
    const href = whatsappLink(lead.whatsappPhone || lead.phone, waMessage(lead))
    if (!href) {
      setError('אין מספר WhatsApp לליד הזה')
      return
    }
    window.open(href, '_blank', 'noopener,noreferrer')
    setBusyId(lead.id)
    try {
      const res = await fetch(`/api/superadmin/sales-leads/${lead.id}`, {
        method: 'PATCH',
        headers: { ...adminHeaders(secret), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'whatsapp_opened' }),
      })
      const json = (await res.json()) as { lead?: SalesLead }
      if (res.ok && json.lead) {
        setLeads((prev) => prev.map((l) => (l.id === lead.id ? json.lead! : l)))
      }
    } catch {
      /* non-blocking */
    } finally {
      setBusyId(null)
    }
  }

  async function deleteOne(id: string) {
    if (!window.confirm('למחוק את הליד הזה לצמיתות?')) return
    setBusyId(id)
    setError('')
    try {
      const res = await fetch(`/api/superadmin/sales-leads/${id}`, {
        method: 'DELETE',
        headers: adminHeaders(secret),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error || 'מחיקה נכשלה')
      setLeads((prev) => prev.filter((l) => l.id !== id))
      setTotal((t) => Math.max(0, t - 1))
      setSelected((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusyId(null)
    }
  }

  async function deleteSelected() {
    const ids = [...selected]
    if (ids.length === 0) return
    if (!window.confirm(`למחוק ${ids.length} לידים שנבחרו?`)) return
    setBulkBusy(true)
    setError('')
    try {
      const res = await fetch('/api/superadmin/sales-leads', {
        method: 'DELETE',
        headers: { ...adminHeaders(secret), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const json = (await res.json()) as { deleted?: number; error?: string }
      if (!res.ok) throw new Error(json.error || 'מחיקה נכשלה')
      setOkMsg(`נמחקו ${json.deleted ?? ids.length} לידים`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkStatus(next: LeadStatus) {
    const ids = [...selected]
    if (ids.length === 0) return
    setBulkBusy(true)
    setError('')
    try {
      for (const id of ids) {
        const res = await fetch(`/api/superadmin/sales-leads/${id}`, {
          method: 'PATCH',
          headers: { ...adminHeaders(secret), 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: next }),
        })
        if (!res.ok) {
          const json = (await res.json()) as { error?: string }
          throw new Error(json.error || 'עדכון מרובה נכשל')
        }
      }
      setOkMsg(`עודכנו ${ids.length} לידים → ${statusLabelHe(next)}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBulkBusy(false)
    }
  }

  const ranked = useMemo(() => leads, [leads])

  return (
    <div className="sa-tab-panel sa-leads" dir="rtl">
      <section className="sa-panel sa-leads-hero">
        <div className="sa-leads-hero-top">
          <div>
            <h2>מנוע לידים · מכירת BINO</h2>
            <p className="sa-muted">
              סריקה יומית בישראל (Places + OSM) · ICP רחב ליעד ₪100K MRR · פנייה מהירה ב-WhatsApp
            </p>
          </div>
          <div className="sa-leads-hero-actions">
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
        </div>

        {counters ? (
          <div className="sa-leads-kpis">
            <div>
              <strong>{counters.total}</strong>
              <span>במאגר</span>
            </div>
            <div>
              <strong>{counters.byFitClass.suitable ?? 0}</strong>
              <span>מתאימים</span>
            </div>
            <div>
              <strong>₪{counters.pipelineMrrIls.toLocaleString('he-IL')}</strong>
              <span>MRR בצנרת</span>
            </div>
            <div>
              <strong>{progressPct}%</strong>
              <span>מול יעד 100K</span>
            </div>
          </div>
        ) : null}

        {discovering || discoverPct > 0 ? (
          <div className="sa-discover-progress" aria-live="polite">
            <div className="sa-discover-progress-meta">
              <strong>{Math.round(discoverPct)}%</strong>
              <span>{discoverPhase || 'גילוי בתהליך…'}</span>
              {(discoverFound > 0 || discoverCreated > 0) && (
                <span className="sa-discover-progress-counts">
                  נמצאו {discoverFound} · נוצרו {discoverCreated}
                </span>
              )}
            </div>
            <div className="sa-discover-progress-track">
              <div
                className="sa-discover-progress-fill"
                style={{ width: `${Math.max(2, Math.min(100, discoverPct))}%` }}
              />
            </div>
          </div>
        ) : null}
      </section>

      {error ? <div className="sa-banner sa-banner-error">{error}</div> : null}
      {okMsg ? <div className="sa-banner sa-banner-ok">{okMsg}</div> : null}

      <section className="sa-panel sa-leads-filters">
        <div className="sa-filter-grid">
          <label>
            חיפוש
            <input
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              placeholder="שם / עסק / טלפון"
            />
          </label>
          <label>
            עיר
            <select value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">כל הערים</option>
              {ISRAEL_SALES_CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            סגמנט
            <select value={segment} onChange={(e) => setSegment(e.target.value)}>
              <option value="">כל הסגמנטים</option>
              {CORE_SALES_SEGMENT_SLUGS.map((s) => (
                <option key={s} value={s}>
                  {segmentLabelHe(s)}
                </option>
              ))}
            </select>
          </label>
          <label>
            יצירת קשר
            <select
              value={contactability}
              onChange={(e) => setContactability(e.target.value)}
            >
              <option value="mobile,landline,unknown">עם טלפון</option>
              <option value="mobile">נייד בלבד</option>
              <option value="landline">קווי</option>
              <option value="">הכל</option>
            </select>
          </label>
          <label>
            ציון מינימום
            <select
              value={String(minFitScore)}
              onChange={(e) => setMinFitScore(Number(e.target.value))}
            >
              <option value="0">ללא</option>
              <option value="40">40+</option>
              <option value="55">55+</option>
              <option value="60">60+ (מתאים)</option>
              <option value="75">75+</option>
            </select>
          </label>
          <label>
            מיון
            <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
              <option value="fit_score">דירוג התאמה</option>
              <option value="estimated_mrr">MRR משוער</option>
              <option value="created_at">חדש ביותר</option>
            </select>
          </label>
        </div>

        <div className="sa-chip-row">
          <span className="sa-chip-label">סטטוס</span>
          {STATUS_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              className={`sa-chip${status === chip.value ? ' is-on' : ''}`}
              onClick={() => setStatus(chip.value)}
            >
              {chip.label}
              {chip.value && counters?.byStatus
                ? ` (${chip.value
                    .split(',')
                    .reduce((n, s) => n + (counters.byStatus[s] ?? 0), 0)})`
                : ''}
            </button>
          ))}
        </div>

        <div className="sa-chip-row">
          <span className="sa-chip-label">דירוג</span>
          {FIT_CHIPS.map((chip) => (
            <button
              key={chip.label}
              type="button"
              className={`sa-chip${fitClass === chip.value ? ' is-on' : ''}`}
              onClick={() => setFitClass(chip.value)}
            >
              {chip.label}
            </button>
          ))}
        </div>

        <p className="sa-muted sa-leads-count">
          מציג {ranked.length} מתוך {total}
          {selected.size > 0 ? ` · נבחרו ${selected.size}` : ''}
        </p>
      </section>

      {selected.size > 0 ? (
        <section className="sa-panel sa-leads-bulk">
          <strong>{selected.size} נבחרו</strong>
          <div className="sa-lead-actions">
            <LoadingButton
              type="button"
              loading={bulkBusy}
              className="sa-btn sa-btn-danger"
              onClick={() => void deleteSelected()}
            >
              מחק נבחרים
            </LoadingButton>
            {QUICK_STATUSES.slice(0, 4).map((st) => (
              <button
                key={st}
                type="button"
                className="sa-btn sa-btn-ghost"
                disabled={bulkBusy}
                onClick={() => void bulkStatus(st)}
              >
                → {statusLabelHe(st)}
              </button>
            ))}
            <button
              type="button"
              className="sa-btn sa-btn-ghost"
              onClick={() => setSelected(new Set())}
            >
              נקה בחירה
            </button>
          </div>
        </section>
      ) : null}

      <div className="sa-leads-toolbar">
        <label className="sa-check">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          בחר הכל בדף
        </label>
      </div>

      <div className="sa-leads-list">
        {ranked.map((lead, idx) => {
          const canWa = Boolean(whatsappLink(lead.whatsappPhone || lead.phone))
          const score = lead.fitScore
          return (
            <article
              key={lead.id}
              className={`sa-lead-card${selected.has(lead.id) ? ' is-selected' : ''}`}
            >
              <div className="sa-lead-card-top">
                <label className="sa-check sa-lead-check">
                  <input
                    type="checkbox"
                    checked={selected.has(lead.id)}
                    onChange={() => toggleOne(lead.id)}
                  />
                </label>
                <div className="sa-lead-rank" style={{ color: fitTone(score) }}>
                  <span className="sa-lead-rank-num">#{idx + 1}</span>
                  <strong>{score ?? '—'}</strong>
                  <span className="sa-lead-stars">{rankStars(score)}</span>
                  <span className="sa-lead-fit">{fitClassLabelHe(lead.fitClass)}</span>
                </div>
                <div className="sa-lead-main">
                  <h3>{lead.businessName || lead.name}</h3>
                  <p className="sa-muted">
                    {lead.city} · {segmentLabelHe(lead.segmentSlug)} ·{' '}
                    {statusLabelHe(lead.status)} ·{' '}
                    {contactabilityLabelHe(lead.contactability)}
                    {lead.estimatedMrrIls ? ` · MRR ₪${lead.estimatedMrrIls}` : ''}
                  </p>
                  {lead.outreachAngle ? (
                    <p className="sa-lead-angle">{lead.outreachAngle}</p>
                  ) : null}
                  {lead.fitReasons.length > 0 ? (
                    <p className="sa-lead-reasons">
                      {lead.fitReasons.slice(0, 4).join(' · ')}
                    </p>
                  ) : null}
                  <p className="sa-lead-phone">
                    {lead.phone || 'אין טלפון'}
                    {lead.websiteUrl ? (
                      <>
                        {' · '}
                        <a href={lead.websiteUrl} target="_blank" rel="noreferrer">
                          אתר
                        </a>
                      </>
                    ) : null}
                    {lead.sourceUrl ? (
                      <>
                        {' · '}
                        <a href={lead.sourceUrl} target="_blank" rel="noreferrer">
                          מקור
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
              </div>

              <div className="sa-lead-actions">
                {canWa ? (
                  <button
                    type="button"
                    className="sa-btn sa-btn-primary"
                    disabled={busyId === lead.id}
                    onClick={() => void openWhatsapp(lead)}
                  >
                    שלח WhatsApp
                  </button>
                ) : (
                  <button type="button" className="sa-btn sa-btn-ghost" disabled>
                    אין WhatsApp
                  </button>
                )}
                <select
                  className="sa-lead-status-select"
                  value={lead.status}
                  disabled={busyId === lead.id}
                  onChange={(e) => void patchStatus(lead.id, e.target.value as LeadStatus)}
                >
                  {LEAD_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {statusLabelHe(st)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="sa-btn sa-btn-danger-ghost"
                  disabled={busyId === lead.id}
                  onClick={() => void deleteOne(lead.id)}
                >
                  מחק
                </button>
              </div>
            </article>
          )
        })}

        {!loading && ranked.length === 0 ? (
          <p className="sa-muted sa-leads-empty">
            אין לידים לפי הסינון — הריצו גילוי או הרחיבו את הפילטרים.
          </p>
        ) : null}
      </div>

      {runs.length > 0 ? (
        <section className="sa-panel" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>ריצות גילוי אחרונות</h3>
          <ul className="sa-runs">
            {runs.map((r) => (
              <li key={r.id}>
                {new Date(r.started_at).toLocaleString('he-IL')} · {r.city} · {r.status}
                {typeof r.found_count === 'number' ? ` · נמצאו ${r.found_count}` : ''}
                {typeof r.created_count === 'number' ? ` · נוצרו ${r.created_count}` : ''}
                {r.error_message ? ` · ${r.error_message}` : ''}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <style jsx>{`
        .sa-leads-hero-top {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          align-items: flex-start;
        }
        .sa-leads-hero h2 {
          margin: 0;
          font-size: 18px;
        }
        .sa-leads-hero-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .sa-leads-kpis {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
          gap: 10px;
          margin-top: 14px;
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
        }
        .sa-leads-kpis span {
          font-size: 12px;
          color: ${theme.colors.textSecondary};
        }
        .sa-discover-progress {
          margin-top: 14px;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid ${theme.colors.border};
          background: ${theme.colors.background};
        }
        .sa-discover-progress-meta {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: 8px 12px;
          margin-bottom: 10px;
          font-size: 13px;
          color: ${theme.colors.textSecondary};
        }
        .sa-discover-progress-meta strong {
          font-size: 18px;
          color: ${theme.colors.primary};
          font-variant-numeric: tabular-nums;
        }
        .sa-discover-progress-counts {
          margin-inline-start: auto;
          font-size: 12px;
        }
        .sa-discover-progress-track {
          height: 10px;
          border-radius: 999px;
          background: #e5e7eb;
          overflow: hidden;
        }
        .sa-discover-progress-fill {
          height: 100%;
          border-radius: 999px;
          background: linear-gradient(90deg, #0066ff, #38bdf8);
          transition: width 0.45s ease;
        }
        .sa-filter-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 10px;
        }
        .sa-filter-grid label {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 12px;
          color: ${theme.colors.textSecondary};
        }
        .sa-filter-grid input,
        .sa-filter-grid select,
        .sa-lead-status-select {
          width: 100%;
          padding: 8px 10px;
          border-radius: 8px;
          border: 1px solid ${theme.colors.border};
          background: ${theme.colors.surface};
          color: ${theme.colors.textPrimary};
        }
        .sa-chip-row {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          align-items: center;
          margin-top: 12px;
        }
        .sa-chip-label {
          font-size: 12px;
          color: ${theme.colors.textSecondary};
          margin-inline-end: 4px;
        }
        .sa-chip {
          border: 1px solid ${theme.colors.border};
          background: ${theme.colors.background};
          border-radius: 999px;
          padding: 5px 10px;
          font-size: 12px;
          cursor: pointer;
        }
        .sa-chip.is-on {
          border-color: ${theme.colors.primary};
          color: ${theme.colors.primary};
          background: ${theme.colors.surface};
          font-weight: 600;
        }
        .sa-leads-count {
          margin: 10px 0 0;
        }
        .sa-leads-bulk {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 12px;
          border-color: ${theme.colors.primary};
        }
        .sa-leads-toolbar {
          margin: 0 0 8px;
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
        .sa-lead-card.is-selected {
          border-color: ${theme.colors.primary};
          box-shadow: inset 0 0 0 1px ${theme.colors.primary};
        }
        .sa-lead-card-top {
          display: grid;
          grid-template-columns: auto 88px 1fr;
          gap: 10px;
          align-items: start;
        }
        .sa-lead-rank {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          min-width: 72px;
        }
        .sa-lead-rank-num {
          font-size: 11px;
          opacity: 0.7;
        }
        .sa-lead-rank strong {
          font-size: 22px;
          line-height: 1;
        }
        .sa-lead-stars {
          font-size: 11px;
          letter-spacing: 1px;
        }
        .sa-lead-fit {
          font-size: 11px;
          font-weight: 600;
        }
        .sa-lead-main h3 {
          margin: 0 0 4px;
          font-size: 16px;
        }
        .sa-lead-angle {
          margin: 6px 0;
          font-size: 13px;
          color: ${theme.colors.textPrimary};
        }
        .sa-lead-reasons {
          margin: 0 0 4px;
          font-size: 11px;
          color: ${theme.colors.textSecondary};
        }
        .sa-lead-phone {
          margin: 0;
          font-size: 13px;
        }
        .sa-lead-phone a {
          color: ${theme.colors.primary};
        }
        .sa-lead-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 10px;
          align-items: center;
        }
        .sa-lead-status-select {
          width: auto;
          min-width: 120px;
        }
        .sa-btn-danger {
          background: #b91c1c;
          color: #fff;
          border: none;
        }
        .sa-btn-danger-ghost {
          color: #b91c1c;
          border-color: #fecaca;
          background: transparent;
        }
        .sa-leads-empty {
          padding: 24px 8px;
          text-align: center;
        }
        .sa-runs {
          margin: 0;
          padding-inline-start: 18px;
          color: ${theme.colors.textSecondary};
          font-size: 13px;
        }
        @media (max-width: 640px) {
          .sa-lead-card-top {
            grid-template-columns: auto 1fr;
          }
          .sa-lead-rank {
            grid-column: 2;
            flex-direction: row;
            justify-content: flex-start;
            gap: 8px;
            min-width: 0;
          }
        }
      `}</style>
    </div>
  )
}
