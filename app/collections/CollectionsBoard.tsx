'use client'

import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { withClientId } from '@/lib/supabase/with-client-id'
import { toast, asyncHandler, errorMessageFromResponseJson } from '@/lib/error-handler'
import {
  fetchWithTimeout,
  MUTATION_FETCH_TIMEOUT_MS,
} from '@/lib/fetch-with-timeout'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { useTenantProjectsList } from '@/lib/hooks/use-projects-list'
import {
  COLLECTION_CHARGE_STATUS_COLORS,
  COLLECTION_CHARGE_STATUS_LABELS,
  formatChargeAmountIls,
  type CollectionChargeListItem,
  type CollectionChargeStatus,
} from '@/lib/collection-charges'
import { residentMatchesQuery } from '@/lib/collection-resident-search'
import {
  Button,
  Drawer,
  EmptyState,
  SearchInput,
  Select,
  theme,
} from '@/app/components/ui'
import { PageTransitionLoader } from '@/app/components/page-skeleton'

type ProjectOption = { id: string; name: string }
type ResidentOption = {
  id: string
  full_name: string
  apartment_number: string | null
  phone: string | null
  normalized_phone: string | null
  project_id?: string | null
}

type SummaryChips = {
  sent: number
  paid: number
  pending: number
  failed: number
}

type MoneySummary = {
  collected: number
  outstanding: number
  billed: number
  collection_rate: number
  open_count: number
  paid_count: number
}

type BulkPreviewRow = ResidentOption & { amount: string; selected: boolean }

function formatDateHe(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

function residentPhone(r: { phone: string | null; normalized_phone?: string | null }): string {
  return (r.normalized_phone || r.phone || '').trim()
}

export function CollectionsBoard() {
  const [isMobile, setIsMobile] = useState(false)
  const [boardLoading, setBoardLoading] = useState(true)
  const [hasBoardData, setHasBoardData] = useState(false)
  const hasBoardDataRef = useRef(false)
  const {
    clientId,
    projects: projectRows,
    isLoading: projectsLoading,
    hasData: projectsHasData,
  } = useTenantProjectsList()
  const projects: ProjectOption[] = useMemo(
    () => projectRows.map((p) => ({ id: p.id, name: p.name })),
    [projectRows]
  )
  const [items, setItems] = useState<CollectionChargeListItem[]>([])
  const [chips, setChips] = useState<SummaryChips>({ sent: 0, paid: 0, pending: 0, failed: 0 })
  const [money, setMoney] = useState<MoneySummary>({
    collected: 0,
    outstanding: 0,
    billed: 0,
    collection_rate: 0,
    open_count: 0,
    paid_count: 0,
  })

  const [projectFilter, setProjectFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [periodFilter, setPeriodFilter] = useState('')

  const [bulkOpen, setBulkOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Bulk form
  const [bulkProjectId, setBulkProjectId] = useState('')
  const [bulkTitle, setBulkTitle] = useState('ועד בית')
  const [bulkPeriod, setBulkPeriod] = useState('')
  const [bulkMode, setBulkMode] = useState<'fixed' | 'per'>('fixed')
  const [bulkFixedAmount, setBulkFixedAmount] = useState('')
  const [bulkSkipNoPhone, setBulkSkipNoPhone] = useState(true)
  const [bulkRows, setBulkRows] = useState<BulkPreviewRow[]>([])
  const [bulkSending, setBulkSending] = useState(false)
  const [bulkResult, setBulkResult] = useState<string | null>(null)

  // Single create form
  const [cProjectId, setCProjectId] = useState('')
  const [cResidents, setCResidents] = useState<ResidentOption[]>([])
  const [cResidentId, setCResidentId] = useState('')
  const [cResidentQuery, setCResidentQuery] = useState('')
  const deferredResidentQuery = useDeferredValue(cResidentQuery)
  const [cResidentsLoading, setCResidentsLoading] = useState(false)
  const [cTitle, setCTitle] = useState('ועד בית')
  const [cAmount, setCAmount] = useState('')
  const [cDescription, setCDescription] = useState('')
  const [cPeriod, setCPeriod] = useState('')
  const [cSaving, setCSaving] = useState(false)
  const [accountReady, setAccountReady] = useState<boolean | null>(null)
  const [accountMessage, setAccountMessage] = useState('')
  const [growLegalReady, setGrowLegalReady] = useState<boolean | null>(null)

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const loadAccountStatus = useCallback(async () => {
    try {
      const res = await fetchWithTimeout(
        '/api/collections/account-status',
        {},
        MUTATION_FETCH_TIMEOUT_MS
      )
      const body = (await res.json().catch(() => ({}))) as {
        ready?: boolean
        message?: string
        error?: string
        grow_legal_ready?: boolean
      }
      if (!res.ok) {
        setAccountReady(false)
        setGrowLegalReady(null)
        setAccountMessage(
          typeof body.error === 'string'
            ? body.error
            : 'לא ניתן לבדוק את חשבון Grow. היכנסו להגדרות.'
        )
        return
      }
      setAccountReady(body.ready === true)
      setGrowLegalReady(body.grow_legal_ready === true)
      setAccountMessage(
        body.message ||
          (body.ready
            ? 'החשבון מוכן לגבייה.'
            : 'חסר חיבור Grow. פתחו חשבון והדביקו userId בהגדרות.')
      )
    } catch {
      // Soft-fail: board can still show charges; avoid timeout toast spam.
      setAccountReady(null)
      setGrowLegalReady(null)
      setAccountMessage('')
    }
  }, [])

  const loadCharges = useCallback(async () => {
    const params = new URLSearchParams()
    if (projectFilter) params.set('project_id', projectFilter)
    if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)
    if (searchTerm.trim()) params.set('q', searchTerm.trim())
    if (periodFilter.trim()) params.set('period_label', periodFilter.trim())
    params.set('page_size', '100')

    const [listRes, sumRes] = await Promise.all([
      fetchWithTimeout(`/api/collections/charges?${params.toString()}`, {}, MUTATION_FETCH_TIMEOUT_MS),
      fetchWithTimeout(
        `/api/collections/summary?${new URLSearchParams({
          ...(projectFilter ? { project_id: projectFilter } : {}),
          ...(periodFilter.trim() ? { period_label: periodFilter.trim() } : {}),
        }).toString()}`,
        {},
        MUTATION_FETCH_TIMEOUT_MS
      ),
    ])

    const listJson = (await listRes.json().catch(() => ({}))) as {
      items?: CollectionChargeListItem[]
      error?: string
    }
    if (!listRes.ok) throw new Error(listJson.error || 'טעינת חיובים נכשלה')
    setItems(listJson.items || [])

    const sumJson = (await sumRes.json().catch(() => ({}))) as {
      chips?: SummaryChips
      money?: MoneySummary
      error?: string
    }
    if (sumRes.ok && sumJson.chips) setChips(sumJson.chips)
    if (sumRes.ok && sumJson.money) setMoney(sumJson.money)
  }, [periodFilter, projectFilter, searchTerm, statusFilter])

  // Charges first (paint board); Grow account check in background (don't block / toast on slow Grow).
  useEffect(() => {
    if (!clientId) return
    void (async () => {
      if (!hasBoardDataRef.current) setBoardLoading(true)
      await asyncHandler(
        async () => {
          await loadCharges()
          hasBoardDataRef.current = true
          setHasBoardData(true)
          return true
        },
        { context: 'טעינת גביית ועד', showErrorToast: true }
      )
      setBoardLoading(false)
      void loadAccountStatus()
    })()
  }, [clientId, loadAccountStatus, loadCharges])

  const loading =
    (boardLoading && !hasBoardData) || (projectsLoading && !projectsHasData) || !clientId

  async function refresh() {
    await asyncHandler(
      async () => {
        await Promise.all([loadCharges(), loadAccountStatus()])
        return true
      },
      { context: 'רענון חיובים', showErrorToast: true }
    )
  }

  async function loadResidentsForProject(projectId: string): Promise<ResidentOption[]> {
    if (!clientId || !projectId) return []
    const { data, error } = await withClientId(
      supabase
        .from('residents')
        .select('id, full_name, apartment_number, phone, normalized_phone, project_id')
        .eq('project_id', projectId)
        .is('deleted_at', null),
      clientId
    ).order('apartment_number', { ascending: true })
    if (error) throw error
    return (data as ResidentOption[]) || []
  }

  async function loadResidentsForClient(): Promise<ResidentOption[]> {
    if (!clientId) return []
    const { data, error } = await withClientId(
      supabase
        .from('residents')
        .select('id, full_name, apartment_number, phone, normalized_phone, project_id')
        .is('deleted_at', null),
      clientId
    )
      .order('full_name', { ascending: true })
      .limit(1000)
    if (error) throw error
    return (data as ResidentOption[]) || []
  }

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const p of projects) map.set(p.id, p.name)
    return map
  }, [projects])

  const cSelectedResident = useMemo(
    () => cResidents.find((r) => r.id === cResidentId) || null,
    [cResidents, cResidentId]
  )

  const cResidentMatches = useMemo(() => {
    if (cResidentId) return []
    const q = deferredResidentQuery.trim()
    if (q.length < 2) return []
    return cResidents.filter((r) => residentMatchesQuery(r, q)).slice(0, 25)
  }, [cResidents, cResidentId, deferredResidentQuery])

  function selectCreateResident(r: ResidentOption) {
    setCResidentId(r.id)
    setCProjectId(r.project_id || '')
    setCResidentQuery('')
  }

  function clearCreateResident() {
    setCResidentId('')
    setCProjectId('')
    setCResidentQuery('')
  }

  async function openBulk() {
    if (accountReady === false) {
      toast.error(accountMessage || 'הגדירו קודם חשבון Grow בהגדרות.')
      return
    }
    setCreateOpen(false)
    setBulkResult(null)
    setBulkOpen(true)
    const pid = bulkProjectId || projectFilter || projects[0]?.id || ''
    setBulkProjectId(pid)
    if (pid) {
      await asyncHandler(
        async () => {
          const rows = await loadResidentsForProject(pid)
          setBulkRows(
            rows.map((r) => ({
              ...r,
              amount: bulkFixedAmount,
              selected: bulkSkipNoPhone ? Boolean(residentPhone(r)) : true,
            }))
          )
          return true
        },
        { context: 'טעינת דיירים', showErrorToast: true }
      )
    }
  }

  async function onBulkProjectChange(pid: string) {
    setBulkProjectId(pid)
    setBulkResult(null)
    await asyncHandler(
      async () => {
        const rows = await loadResidentsForProject(pid)
        setBulkRows(
          rows.map((r) => ({
            ...r,
            amount: bulkMode === 'fixed' ? bulkFixedAmount : '',
            selected: bulkSkipNoPhone ? Boolean(residentPhone(r)) : true,
          }))
        )
        return true
      },
      { context: 'טעינת דיירים', showErrorToast: true }
    )
  }

  function onBulkFixedAmountChange(value: string) {
    setBulkFixedAmount(value)
    if (bulkMode === 'fixed') {
      setBulkRows((prev) => prev.map((r) => ({ ...r, amount: value })))
    }
  }

  function onBulkModeChange(mode: 'fixed' | 'per') {
    setBulkMode(mode)
    if (mode === 'fixed') {
      setBulkRows((prev) => prev.map((r) => ({ ...r, amount: bulkFixedAmount })))
    }
  }

  function onBulkSkipNoPhoneChange(checked: boolean) {
    setBulkSkipNoPhone(checked)
    setBulkRows((prev) =>
      prev.map((r) => ({
        ...r,
        selected: checked ? Boolean(residentPhone(r)) : true,
      }))
    )
  }

  async function submitBulk() {
    const selected = bulkRows.filter((r) => r.selected)
    if (!bulkProjectId) {
      toast.error('בחרו בניין')
      return
    }
    if (!bulkTitle.trim()) {
      toast.error('הזינו כותרת')
      return
    }
    if (selected.length === 0) {
      toast.error('בחרו לפחות דייר אחד')
      return
    }
    const items: { resident_id: string; amount: number }[] = []
    for (const r of selected) {
      const amount = Number(r.amount)
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error(`סכום לא תקין עבור ${r.full_name}`)
        return
      }
      if (bulkSkipNoPhone && !residentPhone(r)) continue
      items.push({ resident_id: r.id, amount })
    }
    if (items.length === 0) {
      toast.error('אין דיירים לשליחה')
      return
    }

    setBulkSending(true)
    await asyncHandler(
      async () => {
        const res = await fetchWithTimeout(
          '/api/collections/charges/bulk-send',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              project_id: bulkProjectId,
              title_template: bulkTitle.trim(),
              period_label: bulkPeriod.trim() || null,
              items,
              send_sms: true,
            }),
          },
          MUTATION_FETCH_TIMEOUT_MS
        )
        const json = (await res.json().catch(() => ({}))) as {
          error?: string
          created?: number
          sent?: number
          failed?: number
          batch_id?: string
        }
        if (!res.ok) throw new Error(errorMessageFromResponseJson(json, 'שליחה מרוכזת נכשלה'))
        setBulkResult(
          `נוצרו ${json.created ?? 0} · נשלחו ${json.sent ?? 0} · נכשלו ${json.failed ?? 0}`
        )
        toast.success('השליחה המרוכזת הושלמה')
        await loadCharges()
        return true
      },
      { context: 'שליחה מרוכזת', showErrorToast: true }
    )
    setBulkSending(false)
  }

  async function openCreate() {
    if (accountReady === false) {
      toast.error(accountMessage || 'הגדירו קודם חשבון Grow בהגדרות.')
      return
    }
    setBulkOpen(false)
    setCreateOpen(true)
    setCResidentId('')
    setCProjectId('')
    setCResidentQuery('')
    setCResidentsLoading(true)
    await asyncHandler(
      async () => {
        setCResidents(await loadResidentsForClient())
        return true
      },
      { context: 'טעינת דיירים', showErrorToast: true }
    )
    setCResidentsLoading(false)
  }

  async function submitCreate(send: boolean) {
    const amount = Number(cAmount)
    if (!cProjectId || !cResidentId || !cTitle.trim() || !Number.isFinite(amount) || amount <= 0) {
      toast.error('בחרו דייר, מלאו כותרת וסכום')
      return
    }
    setCSaving(true)
    await asyncHandler(
      async () => {
        const res = await fetchWithTimeout(
          '/api/collections/charges',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              project_id: cProjectId,
              resident_id: cResidentId,
              title: cTitle.trim(),
              amount,
              description: cDescription.trim() || null,
              period_label: cPeriod.trim() || null,
              send,
              send_sms: true,
            }),
          },
          MUTATION_FETCH_TIMEOUT_MS
        )
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) throw new Error(errorMessageFromResponseJson(json, 'יצירת חיוב נכשלה'))
        toast.success(send ? 'החיוב נוצר ונשלח' : 'החיוב נשמר כטיוטה')
        setCreateOpen(false)
        setCAmount('')
        setCDescription('')
        await loadCharges()
        return true
      },
      { context: 'יצירת חיוב', showErrorToast: true }
    )
    setCSaving(false)
  }

  async function postChargeAction(
    path: string,
    chargeId: string,
    successMsg: string
  ) {
    setBusyId(chargeId)
    await asyncHandler(
      async () => {
        const res = await fetchWithTimeout(
          path,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ charge_id: chargeId }),
          },
          MUTATION_FETCH_TIMEOUT_MS
        )
        const json = (await res.json().catch(() => ({}))) as {
          error?: string
          pay_url?: string
        }
        if (!res.ok) throw new Error(errorMessageFromResponseJson(json, 'הפעולה נכשלה'))
        toast.success(successMsg)
        await loadCharges()
        return true
      },
      { context: 'פעולה על חיוב', showErrorToast: true }
    )
    setBusyId(null)
  }

  async function copyPayLink(row: CollectionChargeListItem) {
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}/pay/${row.public_token}`
        : `/pay/${row.public_token}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('הקישור הועתק')
    } catch {
      toast.error('העתקה נכשלה')
    }
  }

  const projectOptions = useMemo(
    () => [
      { label: 'כל הבניינים', value: '' },
      ...projects.map((p) => ({ label: p.name, value: p.id })),
    ],
    [projects]
  )

  if (loading) {
    return <PageTransitionLoader />
  }

  const statusTabs: { label: string; value: string; count?: number }[] = [
    { label: 'הכל', value: 'all' },
    { label: 'ממתינים', value: 'sent', count: chips.pending },
    { label: 'שולם', value: 'paid', count: chips.paid },
    { label: 'טיוטה', value: 'draft' },
    { label: 'נכשל', value: 'failed', count: chips.failed },
  ]

  return (
    <div style={styles.page}>
      {accountReady === false ? (
        <div style={styles.alertBox}>
          <div style={styles.alertTitle}>חסר חשבון Grow</div>
          <p style={styles.alertText}>
            {accountMessage ||
              'פתחו חשבון ב-Grow, הדביקו את ה-userId בהגדרות והפעילו חיבור. הכסף נכנס לחשבון שלכם.'}
          </p>
          <Link href="/settings?tab=grow">
            <Button>להגדרת החשבון</Button>
          </Link>
        </div>
      ) : null}

      {accountReady === true && growLegalReady === false ? (
        <div style={styles.alertSoft}>
          <span style={{ flex: 1, fontSize: 13, lineHeight: 1.45 }}>
            פרטי עסק חלקיים — מלאו שם/טלפון/כתובת בהגדרות.
          </span>
          <Link href="/settings?tab=grow" style={styles.settingsLink}>
            להשלמה
          </Link>
        </div>
      ) : null}

      <section style={styles.hero}>
        <div style={styles.heroTop}>
          <div>
            <div style={styles.heroEyebrow}>נגבה עד כה</div>
            <div style={styles.heroAmount}>{formatChargeAmountIls(money.collected)}</div>
            <div style={styles.heroSub}>
              מתוך {formatChargeAmountIls(money.billed)} · {money.collection_rate}% גבייה
            </div>
          </div>
          <button type="button" style={styles.refreshBtn} onClick={() => void refresh()}>
            רענון
          </button>
        </div>
        <div style={styles.kpiRow}>
          <div style={styles.kpi}>
            <div style={styles.kpiLabel}>ממתין לתשלום</div>
            <div style={{ ...styles.kpiValue, color: '#b45309' }}>
              {formatChargeAmountIls(money.outstanding)}
            </div>
            <div style={styles.kpiHint}>{money.open_count} חיובים פתוחים</div>
          </div>
          <div style={styles.kpi}>
            <div style={styles.kpiLabel}>שולמו</div>
            <div style={{ ...styles.kpiValue, color: '#15803d' }}>{money.paid_count}</div>
            <div style={styles.kpiHint}>אישורי תשלום</div>
          </div>
        </div>
      </section>

      <div style={styles.primaryActions}>
        <Button
          onClick={() => void openBulk()}
          disabled={accountReady === false}
          style={{ flex: 1, minHeight: 48 }}
        >
          שליחה לבניין
        </Button>
        <Button
          variant="secondary"
          onClick={() => void openCreate()}
          disabled={accountReady === false}
          style={{ flex: 1, minHeight: 48 }}
        >
          חיוב בודד
        </Button>
      </div>

      <div style={styles.statusTabs} role="tablist" aria-label="סינון סטטוס">
        {statusTabs.map((tab) => {
          const active = statusFilter === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setStatusFilter(tab.value)}
              style={{
                ...styles.statusTab,
                ...(active ? styles.statusTabActive : null),
              }}
            >
              {tab.label}
              {typeof tab.count === 'number' ? (
                <span style={styles.statusCount}>{tab.count}</span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div style={{ ...styles.filters, flexDirection: isMobile ? 'column' : 'row' }}>
        <Select
          value={projectFilter}
          onChange={setProjectFilter}
          options={projectOptions}
          style={{ minWidth: isMobile ? '100%' : 180 }}
        />
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="חיפוש שם / דירה / טלפון"
          style={{ flex: 1, width: '100%' }}
        />
        <input
          value={periodFilter}
          onChange={(e) => setPeriodFilter(e.target.value)}
          placeholder="תקופה (למשל 2026-07)"
          style={{ ...styles.textInput, maxWidth: isMobile ? '100%' : 180 }}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="אין חיובים להצגה"
          description="התחילו בשליחה לבניין — או צרו חיוב בודד."
        />
      ) : (
        <div style={styles.list}>
          {items.map((row) => {
            const status = row.status as CollectionChargeStatus
            const color = COLLECTION_CHARGE_STATUS_COLORS[status] || '#64748b'
            const busy = busyId === row.id
            const primarySend = status === 'draft' || status === 'failed'
            const canResend = status === 'sent' || status === 'draft'
            return (
              <article key={row.id} style={styles.row}>
                <div style={styles.rowMain}>
                  <div style={styles.rowText}>
                    <div style={styles.cardName}>
                      {row.residents?.full_name || 'דייר'}
                      {row.residents?.apartment_number
                        ? ` · דירה ${row.residents.apartment_number}`
                        : ''}
                    </div>
                    <div style={styles.cardMeta}>
                      {row.projects?.name || '—'}
                      {row.period_label ? ` · ${row.period_label}` : ''}
                      {' · '}
                      {row.title}
                    </div>
                    <div style={styles.cardDates}>
                      {status === 'paid'
                        ? `שולם ${formatDateHe(row.paid_at)}`
                        : `נשלח ${formatDateHe(row.sent_at)}`}
                      {status === 'paid' && row.grow_approve_status === 'ok'
                        ? ' · אושר ב-Grow'
                        : ''}
                      {status === 'paid' && row.grow_approve_status === 'failed'
                        ? ' · ממתין לאישור Grow'
                        : ''}
                    </div>
                  </div>
                  <div style={styles.rowMoney}>
                    <div style={styles.amount}>{formatChargeAmountIls(Number(row.amount))}</div>
                    <span style={{ ...styles.badge, background: `${color}18`, color }}>
                      {COLLECTION_CHARGE_STATUS_LABELS[status] || status}
                    </span>
                  </div>
                </div>

                <div style={styles.actions}>
                  {primarySend ? (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void postChargeAction(
                          '/api/collections/charges/send',
                          row.id,
                          'נשלח לתשלום'
                        )
                      }
                    >
                      שלח לתשלום
                    </Button>
                  ) : null}
                  {status === 'sent' ? (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => void copyPayLink(row)}
                    >
                      העתק קישור
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void copyPayLink(row)}
                    >
                      קישור
                    </Button>
                  )}
                  {canResend && status === 'sent' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void postChargeAction(
                          '/api/collections/charges/resend',
                          row.id,
                          'SMS נשלח מחדש'
                        )
                      }
                    >
                      SMS
                    </Button>
                  ) : null}
                  {status === 'paid' && row.grow_approve_status === 'failed' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void postChargeAction(
                          '/api/collections/charges/retry-approve',
                          row.id,
                          'אישור העסקה ב-Grow הצליח'
                        )
                      }
                    >
                      אשר שוב
                    </Button>
                  ) : null}
                  {status !== 'paid' && status !== 'cancelled' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void postChargeAction(
                          '/api/collections/charges/cancel',
                          row.id,
                          'החיוב בוטל וקישור Bino בוטל'
                        )
                      }
                    >
                      בטל
                    </Button>
                  ) : null}
                  {status !== 'paid' && status !== 'cancelled' && status !== 'draft' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        if (
                          !window.confirm(
                            'לסמן כשולם ידנית? רק אם הדייר שילם והסטטוס לא התעדכן.'
                          )
                        ) {
                          return
                        }
                        void postChargeAction(
                          '/api/collections/charges/mark-paid',
                          row.id,
                          'סומן כשולם'
                        )
                      }}
                    >
                      ידני
                    </Button>
                  ) : null}
                  {row.grow_invoice_url ? (
                    <a
                      href={row.grow_invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={styles.docId}
                    >
                      {row.grow_invoice_email_sent_at ? 'חשבונית נשלחה' : 'חשבונית'}
                    </a>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      )}

      <p style={styles.footerNote}>
        הכסף נכנס לחשבון Grow שלכם.{' '}
        <Link href="/settings?tab=grow" style={styles.settingsLink}>
          הגדרות Grow
        </Link>
      </p>

      <Drawer
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="שליחה מרוכזת לבניין"
        isMobile={isMobile}
        footer={
          <div style={styles.drawerActions}>
            <Button variant="secondary" onClick={() => setBulkOpen(false)}>
              סגור
            </Button>
            <Button disabled={bulkSending} onClick={() => void submitBulk()}>
              {bulkSending ? 'שולח...' : 'צור ושלח'}
            </Button>
          </div>
        }
      >
        <div style={styles.form}>
          <label style={styles.label}>בניין</label>
          <Select
            value={bulkProjectId}
            onChange={(v) => void onBulkProjectChange(v)}
            options={projects.map((p) => ({ label: p.name, value: p.id }))}
            placeholder="בחרו בניין"
            style={{ width: '100%' }}
          />
          <label style={styles.label}>כותרת</label>
          <input
            value={bulkTitle}
            onChange={(e) => setBulkTitle(e.target.value)}
            style={styles.textInput}
          />
          <label style={styles.label}>תקופה (אופציונלי)</label>
          <input
            value={bulkPeriod}
            onChange={(e) => setBulkPeriod(e.target.value)}
            placeholder="2026-07"
            style={styles.textInput}
          />
          <label style={styles.label}>מצב סכום</label>
          <Select
            value={bulkMode}
            onChange={(v) => onBulkModeChange(v as 'fixed' | 'per')}
            options={[
              { label: 'סכום אחיד לכולם', value: 'fixed' },
              { label: 'סכום לכל דייר', value: 'per' },
            ]}
            style={{ width: '100%' }}
          />
          {bulkMode === 'fixed' && (
            <>
              <label style={styles.label}>סכום (₪)</label>
              <input
                value={bulkFixedAmount}
                onChange={(e) => onBulkFixedAmountChange(e.target.value)}
                inputMode="decimal"
                style={styles.textInput}
              />
            </>
          )}
          <label style={styles.checkRow}>
            <input
              type="checkbox"
              checked={bulkSkipNoPhone}
              onChange={(e) => onBulkSkipNoPhoneChange(e.target.checked)}
            />
            דלג על דיירים בלי טלפון
          </label>

          <div style={styles.previewList}>
            {bulkRows.map((r) => (
              <div key={r.id} style={styles.previewRow}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
                  <input
                    type="checkbox"
                    checked={r.selected}
                    disabled={bulkSkipNoPhone && !residentPhone(r)}
                    onChange={(e) =>
                      setBulkRows((prev) =>
                        prev.map((x) =>
                          x.id === r.id ? { ...x, selected: e.target.checked } : x
                        )
                      )
                    }
                  />
                  <span>
                    {r.full_name}
                    {r.apartment_number ? ` · ${r.apartment_number}` : ''}
                    <span style={{ color: theme.colors.textMuted, display: 'block', fontSize: 12 }}>
                      {residentPhone(r) || 'אין טלפון'}
                    </span>
                  </span>
                </label>
                <input
                  value={r.amount}
                  disabled={bulkMode === 'fixed'}
                  onChange={(e) =>
                    setBulkRows((prev) =>
                      prev.map((x) => (x.id === r.id ? { ...x, amount: e.target.value } : x))
                    )
                  }
                  inputMode="decimal"
                  placeholder="₪"
                  style={{ ...styles.textInput, width: 90, margin: 0 }}
                />
              </div>
            ))}
          </div>

          {bulkResult && <p style={styles.result}>{bulkResult}</p>}
        </div>
      </Drawer>

      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="חיוב בודד"
        isMobile={isMobile}
        footer={
          <div style={styles.drawerActions}>
            <Button variant="secondary" disabled={cSaving} onClick={() => void submitCreate(false)}>
              שמור טיוטה
            </Button>
            <Button disabled={cSaving} onClick={() => void submitCreate(true)}>
              צור ושלח
            </Button>
          </div>
        }
      >
        <div style={styles.form}>
          <label style={styles.label}>חיפוש דייר</label>
          {cSelectedResident ? (
            <div style={styles.selectedResident}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.selectedResidentName}>{cSelectedResident.full_name}</div>
                <div style={styles.selectedResidentMeta}>
                  {[
                    cSelectedResident.project_id
                      ? projectNameById.get(cSelectedResident.project_id) || null
                      : null,
                    cSelectedResident.apartment_number
                      ? `דירה ${cSelectedResident.apartment_number}`
                      : null,
                    residentPhone(cSelectedResident) || null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <button type="button" style={styles.clearResidentBtn} onClick={clearCreateResident}>
                החלף
              </button>
            </div>
          ) : (
            <>
              <SearchInput
                value={cResidentQuery}
                onChange={setCResidentQuery}
                placeholder="שם דייר או מספר טלפון"
                style={{ maxWidth: '100%' }}
              />
              {cResidentsLoading ? (
                <p style={styles.hint}>טוען דיירים…</p>
              ) : cResidentQuery.trim().length > 0 && cResidentQuery.trim().length < 2 ? (
                <p style={styles.hint}>הקלידו לפחות 2 תווים</p>
              ) : cResidentQuery.trim().length >= 2 && cResidentMatches.length === 0 ? (
                <p style={styles.hint}>לא נמצאו דיירים מתאימים</p>
              ) : (
                <div style={styles.residentResults}>
                  {cResidentMatches.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      style={styles.residentResultBtn}
                      onClick={() => selectCreateResident(r)}
                    >
                      <span style={styles.selectedResidentName}>{r.full_name}</span>
                      <span style={styles.selectedResidentMeta}>
                        {[
                          r.project_id ? projectNameById.get(r.project_id) || null : null,
                          r.apartment_number ? `דירה ${r.apartment_number}` : null,
                          residentPhone(r) || null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          <label style={styles.label}>כותרת</label>
          <input value={cTitle} onChange={(e) => setCTitle(e.target.value)} style={styles.textInput} />
          <label style={styles.label}>סכום (₪)</label>
          <input
            value={cAmount}
            onChange={(e) => setCAmount(e.target.value)}
            inputMode="decimal"
            style={styles.textInput}
          />
          <label style={styles.label}>תיאור (אופציונלי)</label>
          <textarea
            value={cDescription}
            onChange={(e) => setCDescription(e.target.value)}
            rows={3}
            style={{ ...styles.textInput, resize: 'vertical' }}
          />
          <label style={styles.label}>תקופה (אופציונלי)</label>
          <input
            value={cPeriod}
            onChange={(e) => setCPeriod(e.target.value)}
            placeholder="2026-07"
            style={styles.textInput}
          />
        </div>
      </Drawer>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    paddingBottom: 28,
  },
  hero: {
    borderRadius: 18,
    padding: '18px 18px 16px',
    background: 'linear-gradient(145deg, #0f2744 0%, #1e3a5f 48%, #243b55 100%)',
    color: '#f8fafc',
    boxShadow: '0 10px 28px rgba(15, 39, 68, 0.22)',
  },
  heroTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  heroEyebrow: {
    fontSize: 12,
    fontWeight: 600,
    opacity: 0.78,
    marginBottom: 4,
  },
  heroAmount: {
    fontSize: 34,
    fontWeight: 800,
    letterSpacing: '-0.02em',
    lineHeight: 1.1,
  },
  heroSub: {
    marginTop: 6,
    fontSize: 13,
    opacity: 0.8,
  },
  refreshBtn: {
    border: '1px solid rgba(255,255,255,0.28)',
    background: 'rgba(255,255,255,0.08)',
    color: '#fff',
    borderRadius: 10,
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  kpiRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 10,
  },
  kpi: {
    background: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: '12px 12px 10px',
  },
  kpiLabel: {
    fontSize: 12,
    opacity: 0.75,
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: 800,
    color: '#fff',
  },
  kpiHint: {
    marginTop: 4,
    fontSize: 11,
    opacity: 0.7,
  },
  primaryActions: {
    display: 'flex',
    gap: 10,
  },
  statusTabs: {
    display: 'flex',
    gap: 6,
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    paddingBottom: 2,
  },
  statusTab: {
    flex: '0 0 auto',
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    color: theme.colors.textSecondary,
    borderRadius: 999,
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  statusTabActive: {
    background: '#1e3a5f',
    borderColor: '#1e3a5f',
    color: '#fff',
  },
  statusCount: {
    fontSize: 11,
    fontWeight: 700,
    opacity: 0.85,
  },
  settingsLink: {
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: 700,
    textDecoration: 'none',
  },
  alertBox: {
    padding: 14,
    borderRadius: 14,
    border: '1px solid #fdba74',
    background: '#fff7ed',
  },
  alertTitle: {
    fontWeight: 700,
    marginBottom: 6,
    color: '#9a3412',
  },
  alertText: {
    margin: '0 0 12px',
    fontSize: 14,
    color: '#9a3412',
    lineHeight: 1.55,
  },
  alertSoft: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    padding: '10px 12px',
    borderRadius: 12,
    background: '#f1f5f9',
    color: theme.colors.textSecondary,
  },
  filters: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  textInput: {
    padding: '12px 14px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    fontSize: 15,
    color: theme.colors.textPrimary,
    width: '100%',
    boxSizing: 'border-box',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  row: {
    padding: '14px 14px 12px',
    borderRadius: 16,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  rowMain: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowText: {
    minWidth: 0,
    flex: 1,
  },
  rowMoney: {
    textAlign: 'left',
    flexShrink: 0,
  },
  cardName: {
    fontSize: 16,
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  cardMeta: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginTop: 4,
    lineHeight: 1.4,
  },
  amount: {
    fontSize: 18,
    fontWeight: 800,
    color: theme.colors.textPrimary,
  },
  badge: {
    display: 'inline-block',
    marginTop: 6,
    padding: '3px 8px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
  },
  cardDates: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 6,
  },
  actions: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  docId: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: 600,
  },
  footerNote: {
    margin: '4px 0 0',
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: theme.colors.textSecondary,
  },
  checkRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    fontSize: 14,
    color: theme.colors.textPrimary,
  },
  previewList: {
    maxHeight: 320,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.md,
    padding: 10,
  },
  previewRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  drawerActions: {
    display: 'flex',
    gap: 10,
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
  },
  result: {
    margin: 0,
    padding: 10,
    borderRadius: theme.radius.md,
    background: theme.colors.primaryMuted,
    color: theme.colors.primary,
    fontWeight: 600,
    fontSize: 14,
  },
  hint: {
    margin: 0,
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  residentResults: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    maxHeight: 240,
    overflowY: 'auto',
  },
  residentResultBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 2,
    width: '100%',
    textAlign: 'right',
    padding: '10px 12px',
    borderRadius: 12,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    cursor: 'pointer',
  },
  selectedResident: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 14px',
    borderRadius: 12,
    border: `1px solid ${theme.colors.border}`,
    background: '#f8fafc',
  },
  selectedResidentName: {
    fontSize: 15,
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  selectedResidentMeta: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 1.4,
    marginTop: 2,
  },
  clearResidentBtn: {
    flexShrink: 0,
    border: 'none',
    background: 'transparent',
    color: theme.colors.primary,
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
    padding: '4px 6px',
  },
}
