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
import {
  defaultOutreachMessage,
  outreachVariantsForLead,
} from '@/lib/sales-leads/outreach-templates'
import { formatPhoneLocalIl, openWhatsAppUrl, whatsappLink } from '@/lib/sales-leads/phone'
import { LEAD_STATUSES, type LeadStatus, type SalesLead } from '@/lib/sales-leads/types'

type Counters = {
  total: number
  byStatus: Record<string, number>
  byFitClass: Record<string, number>
  byCity: Array<{ city: string; count: number }>
  bySegment: Array<{ segmentSlug: string; count: number }>
  pipelineMrrIls: number
  targetMrrIls: number
  dueToday?: number
  withContactChannel?: number
  contactChannelPct?: number
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

type SortMode = 'fit_score' | 'created_at' | 'estimated_mrr' | 'next_contact'

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

function enrichmentNum(lead: SalesLead, key: 'rating' | 'reviewCount'): number | null {
  const raw = lead.enrichment?.[key]
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
}

function mapsHref(lead: SalesLead): string | null {
  const src = lead.sourceUrl?.trim()
  if (src && /google\.[^/]+\/maps|maps\.google\.|goo\.gl\/maps|maps\.app\.goo\.gl/i.test(src)) {
    return src
  }
  const addr = lead.businessAddress?.trim()
  if (addr) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`
  }
  return null
}

function formatNextContact(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('he-IL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fitTone(score: number | null | undefined): string {
  if (score == null) return theme.colors.textSecondary
  if (score >= 75) return '#15803d'
  if (score >= 60) return theme.colors.primary
  if (score >= 40) return '#b45309'
  return '#b91c1c'
}

export function SalesLeadsPanel({ secret }: { secret: string }) {
  const [leads, setLeads] = useState<SalesLead[]>([])
  const [total, setTotal] = useState(0)
  const [counters, setCounters] = useState<Counters | null>(null)
  const [runs, setRuns] = useState<RunRow[]>([])
  const [placesConfigured, setPlacesConfigured] = useState<boolean | null>(null)
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
  const [dueTodayOnly, setDueTodayOnly] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  /** Per-lead index into outreachVariantsForLead — cycles on each WhatsApp open. */
  const [waVariantIdx, setWaVariantIdx] = useState<Record<string, number>>({})

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
      if (dueTodayOnly) {
        params.set('dueToday', '1')
        params.set('sort', 'next_contact')
      } else {
        params.set('sort', sort)
      }
      params.set('limit', '100')

      const res = await fetch(`/api/superadmin/sales-leads?${params}`, {
        headers: adminHeaders(secret),
      })
      const json = (await res.json()) as {
        leads?: SalesLead[]
        total?: number
        counters?: Counters
        runs?: RunRow[]
        placesConfigured?: boolean
        error?: string
      }
      if (!res.ok) throw new Error(json.error || 'טעינה נכשלה')
      setLeads(json.leads ?? [])
      setTotal(json.total ?? 0)
      setCounters(json.counters ?? null)
      setRuns(json.runs ?? [])
      if (typeof json.placesConfigured === 'boolean') {
        setPlacesConfigured(json.placesConfigured)
      }
      setSelected(new Set())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setLoading(false)
    }
  }, [secret, q, city, segment, status, fitClass, contactability, minFitScore, sort, dueTodayOnly])

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
        placesConfigured?: boolean
      }
      if (typeof json.placesConfigured === 'boolean') {
        setPlacesConfigured(json.placesConfigured)
      }
      if (!res.ok && json.status !== 'busy') {
        throw new Error(json.errorMessage || json.error || 'גילוי נכשל')
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

  async function patchLead(
    id: string,
    body: Record<string, unknown>,
  ): Promise<SalesLead | null> {
    const res = await fetch(`/api/superadmin/sales-leads/${id}`, {
      method: 'PATCH',
      headers: { ...adminHeaders(secret), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = (await res.json()) as { lead?: SalesLead; error?: string }
    if (!res.ok) throw new Error(json.error || 'עדכון נכשל')
    if (json.lead) setLeads((prev) => prev.map((l) => (l.id === id ? json.lead! : l)))
    return json.lead ?? null
  }

  async function patchStatus(id: string, next: LeadStatus) {
    setBusyId(id)
    setError('')
    try {
      await patchLead(id, { status: next })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusyId(null)
    }
  }

  async function patchEstimatedBuildings(lead: SalesLead) {
    const current = lead.estimatedBuildings ?? ''
    const raw = window.prompt('מספר בניינים משוער', String(current))
    if (raw == null) return
    const trimmed = raw.trim()
    const n = trimmed === '' ? null : Number(trimmed)
    if (n != null && (!Number.isFinite(n) || n < 0 || !Number.isInteger(n))) {
      setError('מספר בניינים חייב להיות מספר שלם לא-שלילי')
      return
    }
    setBusyId(lead.id)
    setError('')
    try {
      await patchLead(lead.id, { estimatedBuildings: n })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusyId(null)
    }
  }

  async function openWhatsapp(lead: SalesLead) {
    const variants = outreachVariantsForLead(lead)
    const idx = (waVariantIdx[lead.id] ?? 0) % Math.max(1, variants.length)
    const { variant, body } = defaultOutreachMessage(lead, variants[idx]?.id)
    const phoneRaw = lead.whatsappPhone || lead.phone || lead.phoneNormalized
    const href = whatsappLink(phoneRaw, body)
    if (!href) {
      setError('אין מספר WhatsApp לליד הזה')
      return
    }

    const localPhone =
      formatPhoneLocalIl(phoneRaw) ||
      formatPhoneLocalIl(lead.phoneNormalized) ||
      phoneRaw?.trim() ||
      ''

    // Open first, while still in the user-gesture stack. Awaiting clipboard
    // before open causes iOS/Android to drop the deep-linked phone.
    openWhatsAppUrl(href)

    try {
      if (localPhone && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(localPhone)
      }
    } catch {
      /* clipboard optional */
    }

    setOkMsg(
      localPhone
        ? `נפתח צ'אט WhatsApp · המספר ${localPhone} הועתק ללוח`
        : 'נפתח צ׳אט WhatsApp',
    )
    setWaVariantIdx((prev) => ({
      ...prev,
      [lead.id]: (idx + 1) % Math.max(1, variants.length),
    }))
    setBusyId(lead.id)
    try {
      const res = await fetch(`/api/superadmin/sales-leads/${lead.id}`, {
        method: 'PATCH',
        headers: { ...adminHeaders(secret), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'whatsapp_opened',
          outreachVariant: variant.id,
        }),
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

  function friendlyError(raw: string): string {
    const t = raw.trim()
    if (!t) return 'שגיאה'
    if (/API_KEY_HTTP_REFERRER_BLOCKED|referer.*blocked/i.test(t)) {
      return 'מפתח Google חסום בגלל הגבלת HTTP referrer — הגדירו Application restrictions ל-None (או IP) במפתח שרת, לא לדפדפן.'
    }
    if (/PERMISSION_DENIED|403/i.test(t) && /Places|Google/i.test(t)) {
      return 'Google Places דחה את הבקשה — בדקו מפתח API, חיוב, והפעלת Places API (New).'
    }
    if (/GOOGLE_PLACES_API_KEY|GOOGLE_MAPS_API_KEY|חסר מפתח/i.test(t)) {
      return t.length > 180 ? `${t.slice(0, 180)}…` : t
    }
    // Strip raw JSON blobs from UI
    const withoutJson = t.replace(/\{[\s\S]*\}$/, '').trim()
    const clean = withoutJson || t
    return clean.length > 220 ? `${clean.slice(0, 220)}…` : clean
  }

  const ranked = useMemo(() => leads, [leads])

  return (
    <div className="sa-tab-panel sa-leads" dir="rtl">
      <section className="sa-panel sa-leads-hero">
        <div className="sa-leads-hero-top">
          <div>
            <h2>מנוע לידים · מכירת BINO</h2>
            <p className="sa-muted">
              מיקוד: ירושלים · תל אביב · גוש דן/מרכז · Places + OSM · יעד ₪100K MRR
            </p>
          </div>
          <div className="sa-leads-hero-actions">
            <LoadingButton
              type="button"
              loading={discovering}
              className="sa-btn sa-btn-primary"
              disabled={placesConfigured === false}
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
            <button
              type="button"
              className={`sa-leads-due-chip${dueTodayOnly ? ' is-on' : ''}`}
              onClick={() => setDueTodayOnly((v) => !v)}
              title="סינון לידים עם nextContactAt להיום או שעבר"
            >
              <strong>{counters.dueToday ?? 0}</strong>
              <span>לטיפול היום</span>
            </button>
            <div>
              <strong>{counters.total}</strong>
              <span>במאגר</span>
            </div>
            <div>
              <strong>{counters.byFitClass.suitable ?? 0}</strong>
              <span>מתאימים</span>
            </div>
            {typeof counters.contactChannelPct === 'number' ? (
              <div>
                <strong>{counters.contactChannelPct}%</strong>
                <span>עם ערוץ קשר</span>
              </div>
            ) : null}
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

        {placesConfigured === false ? (
          <div className="sa-leads-setup-warn" role="status">
            <strong>חסר מפתח Google Places</strong>
            <p>
              המנוע לא יכול לגלות לידים בלי{' '}
              <code>GOOGLE_PLACES_API_KEY</code> ב-Vercel (או{' '}
              <code>GOOGLE_MAPS_API_KEY</code>). הפעילו גם Places API (New) וחיוב
              ב-Google Cloud — אחרת הגילוי נכשל מיד.
            </p>
          </div>
        ) : null}
      </section>

      {error ? (
        <div className="sa-banner sa-banner-error sa-leads-error" title={error}>
          {friendlyError(error)}
        </div>
      ) : null}
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
            <select
              value={dueTodayOnly ? 'next_contact' : sort}
              disabled={dueTodayOnly}
              onChange={(e) => setSort(e.target.value as SortMode)}
            >
              <option value="fit_score">דירוג התאמה</option>
              <option value="estimated_mrr">MRR משוער</option>
              <option value="created_at">חדש ביותר</option>
              <option value="next_contact">תאריך מעקב</option>
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
          const canWa = Boolean(
            whatsappLink(lead.whatsappPhone || lead.phone || lead.phoneNormalized),
          )
          const score = lead.fitScore
          const rating = enrichmentNum(lead, 'rating')
          const reviewCount = enrichmentNum(lead, 'reviewCount')
          const maps = mapsHref(lead)
          const nextContactLabel = formatNextContact(lead.nextContactAt)
          const variants = outreachVariantsForLead(lead)
          const nextVariantIdx = (waVariantIdx[lead.id] ?? 0) % Math.max(1, variants.length)
          const nextVariantLabel = variants[nextVariantIdx]?.labelHe
          const displayName = lead.businessName || lead.name
          return (
            <article
              key={lead.id}
              className={`sa-lead-card${selected.has(lead.id) ? ' is-selected' : ''}`}
            >
              <div className="sa-lead-card-head">
                <label className="sa-check sa-lead-check">
                  <input
                    type="checkbox"
                    checked={selected.has(lead.id)}
                    onChange={() => toggleOne(lead.id)}
                  />
                </label>
                <div className="sa-lead-main">
                  <div className="sa-lead-title-row">
                    <span className="sa-lead-index">#{idx + 1}</span>
                    <h3 className="sa-lead-name" title={displayName}>
                      {displayName}
                    </h3>
                    <div className="sa-lead-score" style={{ color: fitTone(score) }}>
                      <strong>{score ?? '—'}</strong>
                      <span>{fitClassLabelHe(lead.fitClass)}</span>
                    </div>
                  </div>
                  <p className="sa-lead-sub">
                    <span>{lead.city}</span>
                    <span className="sa-lead-dot">·</span>
                    <span>{segmentLabelHe(lead.segmentSlug)}</span>
                    <span className="sa-lead-dot">·</span>
                    <span>{statusLabelHe(lead.status)}</span>
                    <span className="sa-lead-dot">·</span>
                    <span>{contactabilityLabelHe(lead.contactability)}</span>
                    {lead.estimatedMrrIls ? (
                      <>
                        <span className="sa-lead-dot">·</span>
                        <span>MRR ₪{lead.estimatedMrrIls}</span>
                      </>
                    ) : null}
                  </p>
                  <div className="sa-lead-meta-row">
                    <button
                      type="button"
                      className="sa-lead-inline-edit"
                      disabled={busyId === lead.id}
                      onClick={() => void patchEstimatedBuildings(lead)}
                      title="עריכת מספר בניינים"
                    >
                      בניינים: {lead.estimatedBuildings ?? '—'}
                    </button>
                    {rating != null || reviewCount != null ? (
                      <span className="sa-lead-meta-chip">
                        Google {rating != null ? rating.toFixed(1) : '—'}
                        {reviewCount != null ? ` · ${reviewCount}` : ''}
                      </span>
                    ) : null}
                    {nextContactLabel ? (
                      <span className="sa-lead-next-contact">מעקב: {nextContactLabel}</span>
                    ) : null}
                  </div>
                  {lead.outreachAngle ? (
                    <p className="sa-lead-angle">{lead.outreachAngle}</p>
                  ) : null}
                  <p className="sa-lead-phone">
                    <strong className="sa-lead-phone-num">{lead.phone || 'אין טלפון'}</strong>
                    {lead.email ? (
                      <>
                        {' · '}
                        <a href={`mailto:${lead.email}`}>{lead.email}</a>
                      </>
                    ) : null}
                    {lead.websiteUrl ? (
                      <>
                        {' · '}
                        <a href={lead.websiteUrl} target="_blank" rel="noreferrer">
                          אתר
                        </a>
                      </>
                    ) : null}
                    {maps ? (
                      <>
                        {' · '}
                        <a href={maps} target="_blank" rel="noreferrer">
                          מפות
                        </a>
                      </>
                    ) : lead.sourceUrl ? (
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
                    className="sa-btn sa-btn-primary sa-lead-wa"
                    disabled={busyId === lead.id}
                    onClick={() => void openWhatsapp(lead)}
                    title={
                      nextVariantLabel
                        ? `וריאנט הבא: ${nextVariantLabel} (מחליף בכל פתיחה)`
                        : undefined
                    }
                  >
                    WhatsApp
                    {nextVariantLabel ? (
                      <span className="sa-lead-wa-variant"> · {nextVariantLabel}</span>
                    ) : null}
                  </button>
                ) : (
                  <button type="button" className="sa-btn sa-btn-ghost" disabled>
                    אין WhatsApp
                  </button>
                )}
                {lead.email ? (
                  <a
                    className="sa-btn sa-btn-ghost"
                    href={`mailto:${lead.email}?subject=${encodeURIComponent(`BINO — ${displayName}`)}`}
                  >
                    אימייל
                  </a>
                ) : null}
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
        <section className="sa-panel sa-leads-runs">
          <h3>ריצות גילוי אחרונות</h3>
          <ul className="sa-runs">
            {runs.map((r) => (
              <li key={r.id}>
                <span className="sa-runs-main">
                  {new Date(r.started_at).toLocaleString('he-IL')} · {r.city} · {r.status}
                  {typeof r.found_count === 'number' ? ` · נמצאו ${r.found_count}` : ''}
                  {typeof r.created_count === 'number' ? ` · נוצרו ${r.created_count}` : ''}
                </span>
                {r.error_message ? (
                  <span className="sa-runs-err" title={r.error_message}>
                    {friendlyError(r.error_message)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
