'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { LoadingButton } from '@/app/components/LoadingButton'
import { adminHeaders } from '@/app/superadmin/helpers'
import {
  CORE_SALES_SEGMENT_SLUGS,
  ISRAEL_SALES_CITIES,
  segmentLabelHe,
} from '@/lib/sales-leads/config'
import { fitClassLabelHe } from '@/lib/sales-leads/fit-score'
import {
  interestLabelHe,
  interestTone,
  stageLabelHe,
  trackingLabelHe,
} from '@/lib/sales-leads/funnel/model'
import { formatJerusalemDateTime } from '@/lib/sales-leads/funnel/timezone'
import {
  defaultOutreachMessage,
  outreachVariantsForLead,
} from '@/lib/sales-leads/outreach-templates'
import { formatPhoneLocalIl, whatsappLink } from '@/lib/sales-leads/phone'
import type {
  FunnelCounters,
  LeadWorkView,
  SalesLead,
  SalesOperatorLite,
} from '@/lib/sales-leads/types'
import { LeadDetailDrawer } from './sales-leads/LeadDetailDrawer'

type LegacyCounters = {
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
  funnel?: FunnelCounters
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

type SortMode = 'fit_score' | 'created_at' | 'estimated_mrr' | 'next_contact' | 'updated_at'

const OPERATOR_STORAGE_KEY = 'bino_sales_operator_id'
const FILTERS_STORAGE_KEY = 'bino_sales_lead_filters_v1'

const WORK_VIEWS: Array<{ value: LeadWorkView; label: string }> = [
  { value: 'active', label: 'פעילים' },
  { value: 'mine', label: 'שלי' },
  { value: 'due_today', label: 'לטיפול היום' },
  { value: 'overdue', label: 'באיחור' },
  { value: 'interested', label: 'מעוניינים' },
  { value: 'needs_completion', label: 'דורש השלמה' },
  { value: 'waiting', label: 'ממתינים לתשובה' },
  { value: 'customers', label: 'לקוחות' },
  { value: 'lost', label: 'אבודים' },
  { value: 'deferred', label: 'נדחו להמשך' },
  { value: 'all', label: 'הכל' },
]

function interestClass(level: string): string {
  return `sa-interest sa-interest-${interestTone(level)}`
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
  const withoutJson = t.replace(/\{[\s\S]*\}$/, '').trim()
  const clean = withoutJson || t
  return clean.length > 220 ? `${clean.slice(0, 220)}…` : clean
}

export function SalesLeadsPanel({ secret }: { secret: string }) {
  const [leads, setLeads] = useState<SalesLead[]>([])
  const [total, setTotal] = useState(0)
  const [counters, setCounters] = useState<LegacyCounters | null>(null)
  const [funnelCounters, setFunnelCounters] = useState<FunnelCounters | null>(null)
  const [operators, setOperators] = useState<SalesOperatorLite[]>([])
  const [operatorsConfigured, setOperatorsConfigured] = useState(true)
  const [operatorId, setOperatorId] = useState('')
  const [runs, setRuns] = useState<RunRow[]>([])
  const [placesConfigured, setPlacesConfigured] = useState<boolean | null>(null)
  const [dayYmd, setDayYmd] = useState('')
  const [loading, setLoading] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const [discoverPct, setDiscoverPct] = useState(0)
  const [discoverPhase, setDiscoverPhase] = useState('')
  const [discoverFound, setDiscoverFound] = useState(0)
  const [discoverCreated, setDiscoverCreated] = useState(0)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [conflictMsg, setConflictMsg] = useState('')

  const [q, setQ] = useState('')
  const [qDraft, setQDraft] = useState('')
  const [city, setCity] = useState('')
  const [segment, setSegment] = useState('')
  const [view, setView] = useState<LeadWorkView>('active')
  const [fitClass, setFitClass] = useState('suitable,needs_review')
  const [contactability, setContactability] = useState('mobile,landline,unknown')
  const [minFitScore, setMinFitScore] = useState(0)
  const [sort, setSort] = useState<SortMode>('next_contact')
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [waVariantIdx, setWaVariantIdx] = useState<Record<string, number>>({})
  const [filtersReady, setFiltersReady] = useState(false)

  // Restore filters + operator
  useEffect(() => {
    try {
      const op = localStorage.getItem(OPERATOR_STORAGE_KEY)?.trim()
      if (op) setOperatorId(op)
      const raw = sessionStorage.getItem(FILTERS_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>
        if (typeof parsed.q === 'string') {
          setQ(parsed.q)
          setQDraft(parsed.q)
        }
        if (typeof parsed.city === 'string') setCity(parsed.city)
        if (typeof parsed.segment === 'string') setSegment(parsed.segment)
        if (typeof parsed.view === 'string') setView(parsed.view as LeadWorkView)
        if (typeof parsed.fitClass === 'string') setFitClass(parsed.fitClass)
        if (typeof parsed.contactability === 'string') setContactability(parsed.contactability)
        if (typeof parsed.minFitScore === 'number') setMinFitScore(parsed.minFitScore)
        if (typeof parsed.sort === 'string') setSort(parsed.sort as SortMode)
        if (typeof parsed.selectedLeadId === 'string') setSelectedLeadId(parsed.selectedLeadId)
      }
    } catch {
      /* ignore */
    }
    setFiltersReady(true)
  }, [])

  useEffect(() => {
    if (!filtersReady) return
    try {
      sessionStorage.setItem(
        FILTERS_STORAGE_KEY,
        JSON.stringify({
          q,
          city,
          segment,
          view,
          fitClass,
          contactability,
          minFitScore,
          sort,
          selectedLeadId,
        }),
      )
    } catch {
      /* ignore */
    }
  }, [
    filtersReady,
    q,
    city,
    segment,
    view,
    fitClass,
    contactability,
    minFitScore,
    sort,
    selectedLeadId,
  ])

  useEffect(() => {
    try {
      if (operatorId) localStorage.setItem(OPERATOR_STORAGE_KEY, operatorId)
    } catch {
      /* ignore */
    }
  }, [operatorId])

  const load = useCallback(async () => {
    if (!filtersReady) return
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (city) params.set('city', city)
      if (segment) params.set('segment', segment)
      params.set('view', view)
      if (fitClass) params.set('fitClass', fitClass)
      if (contactability) params.set('contactability', contactability)
      if (minFitScore > 0) params.set('minFitScore', String(minFitScore))
      params.set('sort', sort)
      if (operatorId) params.set('viewerOperatorId', operatorId)
      params.set('limit', '100')

      const res = await fetch(`/api/superadmin/sales-leads?${params}`, {
        headers: adminHeaders(secret, operatorId),
      })
      const json = (await res.json()) as {
        leads?: SalesLead[]
        total?: number
        counters?: LegacyCounters
        funnelCounters?: FunnelCounters
        operators?: Array<{ id: string; displayName: string }>
        operatorsConfigured?: boolean
        runs?: RunRow[]
        placesConfigured?: boolean
        dayBounds?: { ymd?: string }
        error?: string
      }
      if (!res.ok) throw new Error(json.error || 'טעינה נכשלה')
      setLeads(json.leads ?? [])
      setTotal(json.total ?? 0)
      setCounters(json.counters ?? null)
      setFunnelCounters(json.funnelCounters ?? json.counters?.funnel ?? null)
      setOperators(json.operators ?? [])
      setOperatorsConfigured(json.operatorsConfigured !== false)
      setRuns(json.runs ?? [])
      setDayYmd(json.dayBounds?.ymd ?? '')
      if (typeof json.placesConfigured === 'boolean') {
        setPlacesConfigured(json.placesConfigured)
      }
      if (!operatorId && (json.operators?.length ?? 0) === 1) {
        setOperatorId(json.operators![0].id)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setLoading(false)
    }
  }, [
    secret,
    q,
    city,
    segment,
    view,
    fitClass,
    contactability,
    minFitScore,
    sort,
    operatorId,
    filtersReady,
  ])

  useEffect(() => {
    void load()
  }, [load])

  // Near-realtime poll while panel is open
  useEffect(() => {
    if (!filtersReady) return
    const t = setInterval(() => {
      void load()
    }, 25000)
    return () => clearInterval(t)
  }, [load, filtersReady])

  useEffect(() => {
    const t = setTimeout(() => setQ(qDraft), 350)
    return () => clearTimeout(t)
  }, [qDraft])

  const selectedLead = useMemo(
    () => leads.find((l) => l.id === selectedLeadId) ?? null,
    [leads, selectedLeadId],
  )

  function onLeadUpdated(updated: SalesLead) {
    setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
  }

  async function claimLead(lead: SalesLead) {
    if (!operatorId) {
      setError('בחרו מי אתם לפני לקיחת אחריות')
      return
    }
    setBusyId(lead.id)
    setError('')
    setConflictMsg('')
    try {
      const res = await fetch(`/api/superadmin/sales-leads/${lead.id}`, {
        method: 'PATCH',
        headers: {
          ...adminHeaders(secret, operatorId),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'claim', expectedVersion: lead.version }),
      })
      const json = (await res.json()) as { lead?: SalesLead; error?: string; code?: string }
      if (res.status === 409) {
        setConflictMsg(json.error || 'הליד כבר נתפס')
        if (json.lead) onLeadUpdated(json.lead)
        return
      }
      if (!res.ok) throw new Error(json.error || 'לקיחה נכשלה')
      if (json.lead) onLeadUpdated(json.lead)
      setOkMsg('הליד בטיפולך')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
    } finally {
      setBusyId(null)
    }
  }

  async function quickPatch(
    lead: SalesLead,
    body: Record<string, unknown>,
  ): Promise<boolean> {
    if (!operatorId) {
      setError('בחרו מי אתם לפני עדכון')
      return false
    }
    setBusyId(lead.id)
    setError('')
    setConflictMsg('')
    try {
      const res = await fetch(`/api/superadmin/sales-leads/${lead.id}`, {
        method: 'PATCH',
        headers: {
          ...adminHeaders(secret, operatorId),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...body, expectedVersion: lead.version }),
      })
      const json = (await res.json()) as { lead?: SalesLead; error?: string; code?: string }
      if (res.status === 409) {
        setConflictMsg(json.error || 'הליד השתנה אצל מישהו אחר')
        if (json.lead) onLeadUpdated(json.lead)
        return false
      }
      if (!res.ok) throw new Error(json.error || 'עדכון נכשל')
      if (json.lead) onLeadUpdated(json.lead)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה')
      return false
    } finally {
      setBusyId(null)
    }
  }

  async function onWhatsappOpened(lead: SalesLead, variantId: string) {
    const phoneRaw = lead.whatsappPhone || lead.phone || lead.phoneNormalized
    const localPhone =
      formatPhoneLocalIl(phoneRaw) ||
      formatPhoneLocalIl(lead.phoneNormalized) ||
      phoneRaw?.trim() ||
      ''

    try {
      if (localPhone && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(localPhone)
      }
    } catch {
      /* optional */
    }

    setOkMsg(
      localPhone
        ? `נפתח צ'אט WhatsApp · המספר ${localPhone} הועתק · לא סומן כשליחה`
        : 'נפתח צ׳אט WhatsApp · לא סומן כשליחה',
    )
    setWaVariantIdx((prev) => {
      const variants = outreachVariantsForLead(lead)
      const idx = (prev[lead.id] ?? 0) % Math.max(1, variants.length)
      return { ...prev, [lead.id]: (idx + 1) % Math.max(1, variants.length) }
    })

    if (!operatorId) return
    try {
      const res = await fetch(`/api/superadmin/sales-leads/${lead.id}`, {
        method: 'PATCH',
        headers: {
          ...adminHeaders(secret, operatorId),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'whatsapp_link_opened',
          outreachVariant: variantId,
        }),
      })
      const json = (await res.json()) as { lead?: SalesLead }
      if (res.ok && json.lead) onLeadUpdated(json.lead)
    } catch {
      /* non-blocking log */
    }
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
          headers: adminHeaders(secret, operatorId),
        })
        if (!res.ok) return
        const json = (await res.json()) as {
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
        /* ignore poll */
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
        headers: {
          ...adminHeaders(secret, operatorId),
          'Content-Type': 'application/json',
        },
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

  const fc = funnelCounters

  return (
    <div className="sa-tab-panel sa-leads" dir="rtl">
      <section className="sa-panel sa-leads-hero">
        <div className="sa-leads-hero-top">
          <div>
            <h2>משפך לידים · מכירות BINO</h2>
            <p className="sa-muted">
              שלב · עניין · אחראי · פעולה הבאה · היסטוריה
              {dayYmd ? ` · יום ירושלים ${dayYmd}` : ''}
            </p>
          </div>
          <div className="sa-leads-hero-actions">
            <label className="sa-operator-pick">
              מי אני
              <select
                value={operatorId}
                onChange={(e) => setOperatorId(e.target.value)}
              >
                <option value="">בחרו מפעיל</option>
                {operators.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.displayName}
                  </option>
                ))}
              </select>
            </label>
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

        {!operatorsConfigured || operators.length === 0 ? (
          <div className="sa-leads-setup-warn" role="status">
            <strong>חסרה הגדרת מפעילי מכירות</strong>
            <p>
              הגדירו <code>BINO_SALES_OPERATORS</code> ב־Vercel כ־JSON עם id/name/email
              לכל אחד משלושת אנשי הצוות (מזהי UUID יציבים). בלי זה אי אפשר לעדכן לידים
              באחריות אישית.
            </p>
          </div>
        ) : null}

        {fc ? (
          <div className="sa-leads-kpis" aria-label="מדדי משפך לפי הסינון הנוכחי">
            <div>
              <strong>{fc.activeCount}</strong>
              <span>פעילים</span>
            </div>
            <div>
              <strong>{fc.interestedCount}</strong>
              <span>מעוניינים</span>
            </div>
            <button
              type="button"
              className={`sa-leads-due-chip${view === 'due_today' ? ' is-on' : ''}`}
              onClick={() => setView('due_today')}
            >
              <strong>{fc.dueTodayCount}</strong>
              <span>להיום</span>
            </button>
            <button
              type="button"
              className={`sa-leads-due-chip sa-leads-overdue-chip${view === 'overdue' ? ' is-on' : ''}`}
              onClick={() => setView('overdue')}
            >
              <strong>{fc.overdueCount}</strong>
              <span>באיחור</span>
            </button>
            <div>
              <strong>{fc.upcomingDemosCount}</strong>
              <span>דמואים עתידיים</span>
            </div>
            <div>
              <strong>{fc.openProposalsCount}</strong>
              <span>הצעות פתוחות</span>
            </div>
            <div title="פוטנציאל — לא הכנסה בפועל">
              <strong>₪{fc.potentialSetupFeeIls.toLocaleString('he-IL')}</strong>
              <span>פוטנציאל הקמה</span>
            </div>
            <div title="פוטנציאל — לא הכנסה בפועל">
              <strong>₪{fc.potentialMrrIls.toLocaleString('he-IL')}</strong>
              <span>פוטנציאל MRR</span>
            </div>
            <div>
              <strong>{fc.dealsMissingValue}</strong>
              <span>חסר סכום</span>
            </div>
          </div>
        ) : null}

        {fc?.byStage ? (
          <div className="sa-leads-stage-strip" aria-label="מספר לידים לפי שלב">
            {Object.entries(fc.byStage).map(([stage, count]) => (
              <span key={stage} className="sa-leads-stage-pill">
                {stageLabelHe(stage)} · {count}
              </span>
            ))}
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
              המנוע לא יכול לגלות לידים בלי <code>GOOGLE_PLACES_API_KEY</code>.
            </p>
          </div>
        ) : null}
      </section>

      {error ? (
        <div className="sa-banner sa-banner-error sa-leads-error" title={error}>
          {friendlyError(error)}
        </div>
      ) : null}
      {conflictMsg ? (
        <div className="sa-banner sa-banner-error" role="alert">
          {conflictMsg} — רעננו את הליד ושמרו מחדש. הטיוטה המקומית לא נדרסת בשקט.
        </div>
      ) : null}
      {okMsg ? <div className="sa-banner sa-banner-ok">{okMsg}</div> : null}

      <section className="sa-panel sa-leads-filters">
        <div className="sa-chip-row">
          <span className="sa-chip-label">תצוגה</span>
          {WORK_VIEWS.map((chip) => (
            <button
              key={chip.value}
              type="button"
              className={`sa-chip${view === chip.value ? ' is-on' : ''}`}
              onClick={() => setView(chip.value)}
            >
              {chip.label}
            </button>
          ))}
        </div>

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
            דירוג התאמה
            <select value={fitClass} onChange={(e) => setFitClass(e.target.value)}>
              <option value="suitable,needs_review">מתאים + לבדיקה</option>
              <option value="suitable">מתאים בלבד</option>
              <option value="needs_review">לבדיקה</option>
              <option value="">כל הדירוגים</option>
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
              <option value="60">60+</option>
              <option value="75">75+</option>
            </select>
          </label>
          <label>
            מיון
            <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
              <option value="next_contact">פעולה הבאה</option>
              <option value="updated_at">עודכן לאחרונה</option>
              <option value="fit_score">דירוג התאמה</option>
              <option value="estimated_mrr">MRR</option>
              <option value="created_at">חדש ביותר</option>
            </select>
          </label>
        </div>

        <p className="sa-muted sa-leads-count">
          מציג {leads.length} מתוך {total}
          {fc ? ` · מדדים על כל התוצאות המסוננות (${fc.filterScope})` : ''}
          {counters ? ` · מאגר כולל ${counters.total}` : ''}
        </p>
      </section>

      <div className={`sa-leads-workspace${selectedLead ? ' has-drawer' : ''}`}>
        <div className="sa-leads-table-wrap">
          <table className="sa-leads-table">
            <thead>
              <tr>
                <th>ליד / חברה</th>
                <th>טלפון</th>
                <th>אחראי</th>
                <th>שלב</th>
                <th>עניין</th>
                <th>קשר אחרון</th>
                <th>פעולה הבאה</th>
                <th>מעקב</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const phoneRaw = lead.whatsappPhone || lead.phone || lead.phoneNormalized
                const variants = outreachVariantsForLead(lead)
                const nextVariantIdx =
                  (waVariantIdx[lead.id] ?? 0) % Math.max(1, variants.length)
                const nextVariant = variants[nextVariantIdx]
                const { body: waBody } = defaultOutreachMessage(lead, nextVariant?.id)
                const waHref = whatsappLink(phoneRaw, waBody)
                const displayName = lead.businessName || lead.name
                const overdue = lead.trackingState === 'overdue'
                return (
                  <tr
                    key={lead.id}
                    className={`sa-lead-row${selectedLeadId === lead.id ? ' is-selected' : ''}${lead.needsCompletion ? ' needs-completion' : ''}`}
                  >
                    <td>
                      <button
                        type="button"
                        className="sa-lead-open"
                        onClick={() => setSelectedLeadId(lead.id)}
                      >
                        <strong>{displayName}</strong>
                        <span className="sa-muted">
                          {lead.city} · {segmentLabelHe(lead.segmentSlug)} ·{' '}
                          {fitClassLabelHe(lead.fitClass)}
                        </span>
                        {lead.needsCompletion ? (
                          <span className="sa-lead-warn-tag">דורש השלמה</span>
                        ) : null}
                      </button>
                    </td>
                    <td className="sa-lead-phone-cell">{lead.phone || '—'}</td>
                    <td>
                      {lead.owner?.displayName ? (
                        lead.owner.displayName
                      ) : (
                        <button
                          type="button"
                          className="sa-btn sa-btn-ghost sa-btn-tiny"
                          disabled={busyId === lead.id || !operatorId}
                          onClick={() => void claimLead(lead)}
                        >
                          לקחת לטיפולי
                        </button>
                      )}
                    </td>
                    <td>
                      <select
                        className="sa-lead-status-select"
                        value={lead.status}
                        disabled={busyId === lead.id || !operatorId}
                        onChange={(e) => {
                          const next = e.target.value
                          if (next === 'lost') {
                            setSelectedLeadId(lead.id)
                            setOkMsg('לבחירת סיבת הפסד — פתחו את כרטיס הליד')
                            return
                          }
                          if (next === 'deferred') {
                            setSelectedLeadId(lead.id)
                            setOkMsg('לדחייה נדרש תאריך חזרה בכרטיס')
                            return
                          }
                          void quickPatch(lead, { status: next })
                        }}
                        aria-label={`שלב של ${displayName}`}
                      >
                        {[
                          'new',
                          'contact_attempt',
                          'conversation_held',
                          'demo_scheduled',
                          'demo_done',
                          'proposal_sent',
                          'negotiation',
                          'customer',
                          'lost',
                          'deferred',
                        ].map((st) => (
                          <option key={st} value={st}>
                            {stageLabelHe(st)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className={interestClass(lead.interestLevel)}>
                        {interestLabelHe(lead.interestLevel)}
                      </span>
                    </td>
                    <td>{formatJerusalemDateTime(lead.lastContactAt) ?? '—'}</td>
                    <td>
                      {lead.nextActionTitle || lead.nextActionAt ? (
                        <>
                          <div>{lead.nextActionTitle || 'מעקב'}</div>
                          <div className="sa-muted">
                            {formatJerusalemDateTime(lead.nextActionAt) ?? '—'}
                          </div>
                        </>
                      ) : (
                        <span className="sa-lead-warn-tag">ללא פעולה</span>
                      )}
                    </td>
                    <td>
                      {overdue ? (
                        <span className="sa-lead-overdue-tag" title="איחור טיפול — לא חוסר עניין">
                          {trackingLabelHe('overdue')}
                        </span>
                      ) : (
                        <span className="sa-muted">{trackingLabelHe(lead.trackingState)}</span>
                      )}
                    </td>
                    <td>
                      <div className="sa-lead-actions">
                        {waHref && nextVariant ? (
                          <a
                            className="sa-btn sa-btn-primary sa-btn-tiny"
                            href={waHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => void onWhatsappOpened(lead, nextVariant.id)}
                          >
                            WA
                          </a>
                        ) : null}
                        <button
                          type="button"
                          className="sa-btn sa-btn-ghost sa-btn-tiny"
                          onClick={() => setSelectedLeadId(lead.id)}
                        >
                          כרטיס
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {!loading && leads.length === 0 ? (
            <p className="sa-muted sa-leads-empty">
              אין לידים לפי הסינון — הריצו גילוי או הרחיבו את הפילטרים.
            </p>
          ) : null}
        </div>

        {selectedLead ? (
          <LeadDetailDrawer
            lead={selectedLead}
            secret={secret}
            operatorId={operatorId}
            operators={operators}
            onClose={() => setSelectedLeadId(null)}
            onLeadUpdated={onLeadUpdated}
            onConflict={(lead, message) => {
              setConflictMsg(message)
              if (lead) onLeadUpdated(lead)
            }}
          />
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
