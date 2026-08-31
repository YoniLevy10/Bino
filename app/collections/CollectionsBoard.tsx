'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { resolveBamakorClientIdForBrowser } from '@/lib/bamakor-client'
import { withClientId } from '@/lib/supabase/with-client-id'
import { toast, asyncHandler, errorMessageFromResponseJson } from '@/lib/error-handler'
import {
  fetchWithTimeout,
  MUTATION_FETCH_TIMEOUT_MS,
} from '@/lib/fetch-with-timeout'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import {
  COLLECTION_CHARGE_STATUS_COLORS,
  COLLECTION_CHARGE_STATUS_LABELS,
  formatChargeAmountIls,
  type CollectionChargeListItem,
  type CollectionChargeStatus,
} from '@/lib/collection-charges'
import {
  Button,
  Card,
  Drawer,
  EmptyState,
  LoadingSpinner,
  SearchInput,
  Select,
  theme,
} from '@/app/components/ui'

type ProjectOption = { id: string; name: string }
type ResidentOption = {
  id: string
  full_name: string
  apartment_number: string | null
  phone: string | null
  normalized_phone: string | null
}

type SummaryChips = {
  sent: number
  paid: number
  pending: number
  failed: number
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
  const [loading, setLoading] = useState(true)
  const [clientId, setClientId] = useState('')
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [items, setItems] = useState<CollectionChargeListItem[]>([])
  const [chips, setChips] = useState<SummaryChips>({ sent: 0, paid: 0, pending: 0, failed: 0 })

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
      const res = await fetchWithTimeout('/api/collections/account-status')
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
      setAccountReady(false)
      setGrowLegalReady(null)
      setAccountMessage('בדיקת חשבון Grow נכשלה. נסו לרענן.')
    }
  }, [])

  const loadProjects = useCallback(async (cid: string) => {
    const { data, error } = await withClientId(
      supabase.from('projects').select('id, name'),
      cid
    ).order('name')
    if (error) throw error
    setProjects((data as ProjectOption[]) || [])
  }, [])

  const loadCharges = useCallback(async () => {
    const params = new URLSearchParams()
    if (projectFilter) params.set('project_id', projectFilter)
    if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)
    if (searchTerm.trim()) params.set('q', searchTerm.trim())
    if (periodFilter.trim()) params.set('period_label', periodFilter.trim())
    params.set('page_size', '100')

    const [listRes, sumRes] = await Promise.all([
      fetchWithTimeout(`/api/collections/charges?${params.toString()}`),
      fetchWithTimeout(
        `/api/collections/summary?${new URLSearchParams({
          ...(projectFilter ? { project_id: projectFilter } : {}),
          ...(periodFilter.trim() ? { period_label: periodFilter.trim() } : {}),
        }).toString()}`
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
      error?: string
    }
    if (sumRes.ok && sumJson.chips) setChips(sumJson.chips)
  }, [periodFilter, projectFilter, searchTerm, statusFilter])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      await asyncHandler(
        async () => {
          const cid = await resolveBamakorClientIdForBrowser()
          setClientId(cid)
          await Promise.all([loadProjects(cid), loadAccountStatus()])
          return true
        },
        { context: 'טעינת גביית ועד', showErrorToast: true }
      )
      setLoading(false)
    })()
  }, [loadProjects, loadAccountStatus])

  useEffect(() => {
    if (!clientId) return
    void (async () => {
      await asyncHandler(
        async () => {
          await loadCharges()
          return true
        },
        { context: 'טעינת חיובים', showErrorToast: true }
      )
    })()
  }, [clientId, loadCharges])

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
        .select('id, full_name, apartment_number, phone, normalized_phone')
        .eq('project_id', projectId)
        .is('deleted_at', null),
      clientId
    ).order('apartment_number', { ascending: true })
    if (error) throw error
    return (data as ResidentOption[]) || []
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
    const pid = cProjectId || projectFilter || projects[0]?.id || ''
    setCProjectId(pid)
    if (pid) {
      await asyncHandler(
        async () => {
          setCResidents(await loadResidentsForProject(pid))
          return true
        },
        { context: 'טעינת דיירים', showErrorToast: true }
      )
    }
  }

  async function onCreateProjectChange(pid: string) {
    setCProjectId(pid)
    setCResidentId('')
    await asyncHandler(
      async () => {
        setCResidents(await loadResidentsForProject(pid))
        return true
      },
      { context: 'טעינת דיירים', showErrorToast: true }
    )
  }

  async function submitCreate(send: boolean) {
    const amount = Number(cAmount)
    if (!cProjectId || !cResidentId || !cTitle.trim() || !Number.isFinite(amount) || amount <= 0) {
      toast.error('מלאו פרויקט, דייר, כותרת וסכום')
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

  const statusOptions = useMemo(
    () => [
      { label: 'הכל', value: 'all' },
      { label: 'טיוטה', value: 'draft' },
      { label: 'נשלח', value: 'sent' },
      { label: 'שולם', value: 'paid' },
      { label: 'נכשל', value: 'failed' },
      { label: 'בוטל', value: 'cancelled' },
    ],
    []
  )

  const projectOptions = useMemo(
    () => [
      { label: 'כל הבניינים', value: '' },
      ...projects.map((p) => ({ label: p.name, value: p.id })),
    ],
    [projects]
  )

  if (loading) {
    return (
      <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {accountReady === false ? (
        <Card>
          <div style={{ padding: 4 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>חסר חשבון Grow</div>
            <p style={{ margin: '0 0 12px', fontSize: 14, color: theme.colors.textSecondary, lineHeight: 1.55 }}>
              {accountMessage ||
                'פתחו חשבון ב-Grow, הדביקו את ה-userId בהגדרות והפעילו חיבור. הכסף נכנס לחשבון שלכם.'}
            </p>
            <Link href="/settings?tab=grow">
              <Button>להגדרת החשבון שלי</Button>
            </Link>
          </div>
        </Card>
      ) : null}

      {accountReady === true && growLegalReady === false ? (
        <Card>
          <div style={{ padding: 4 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>פרטי עסק ל־Grow עדיין חסרים</div>
            <p style={{ margin: '0 0 12px', fontSize: 14, color: theme.colors.textSecondary, lineHeight: 1.55 }}>
              אפשר ליצור חיובים. מלאו שם, טלפון וכתובת בהגדרות כדי שעמוד העסק הציבורי יהיה מלא.
              הכסף נשאר בחשבון Grow שלכם.
            </p>
            <Link href="/settings?tab=grow">
              <Button variant="secondary">לפרטי העסק</Button>
            </Link>
          </div>
        </Card>
      ) : null}

      <div
        style={{
          ...styles.toolbar,
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'stretch' : 'center',
        }}
      >
        <Button onClick={() => void openBulk()} disabled={accountReady === false}>
          שליחה מרוכזת לבניין
        </Button>
        <Button
          variant="secondary"
          onClick={() => void openCreate()}
          disabled={accountReady === false}
        >
          חיוב בודד
        </Button>
        <Button variant="secondary" onClick={() => void refresh()}>
          רענון
        </Button>
        <Link
          href="/settings?tab=grow"
          style={{
            ...styles.settingsLink,
            marginInlineStart: isMobile ? 0 : 'auto',
          }}
        >
          הגדרות Grow
        </Link>
      </div>

      <div style={{ ...styles.chips, flexDirection: isMobile ? 'column' : 'row' }}>
        <Chip label="נשלחו" value={chips.sent} color="#2563eb" />
        <Chip label="שולמו" value={chips.paid} color="#16a34a" />
        <Chip label="ממתינים" value={chips.pending} color="#ca8a04" />
        <Chip label="נכשלו" value={chips.failed} color="#dc2626" />
      </div>

      <div style={{ ...styles.filters, flexDirection: isMobile ? 'column' : 'row' }}>
        <Select
          value={projectFilter}
          onChange={setProjectFilter}
          options={projectOptions}
          style={{ minWidth: isMobile ? '100%' : 180 }}
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          options={statusOptions}
          style={{ minWidth: isMobile ? '100%' : 140 }}
        />
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="חיפוש שם / דירה / טלפון"
          style={{ flex: 1, maxWidth: isMobile ? '100%' : 320 }}
        />
        <input
          value={periodFilter}
          onChange={(e) => setPeriodFilter(e.target.value)}
          placeholder="תקופה (למשל 2026-07)"
          style={styles.textInput}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="אין חיובים להצגה"
          description="התחילו בשליחה מרוכזת לבניין — או צרו חיוב בודד."
        />
      ) : (
        <div style={styles.list}>
          {items.map((row) => {
            const status = row.status as CollectionChargeStatus
            const color = COLLECTION_CHARGE_STATUS_COLORS[status] || '#64748b'
            const busy = busyId === row.id
            return (
              <Card key={row.id} noPadding>
                <div style={styles.cardInner}>
                  <div style={styles.cardTop}>
                    <div>
                      <div style={styles.cardName}>
                        {row.residents?.full_name || 'דייר'}
                        {row.residents?.apartment_number
                          ? ` · דירה ${row.residents.apartment_number}`
                          : ''}
                      </div>
                      <div style={styles.cardMeta}>
                        {row.projects?.name || '—'} · {row.title}
                        {row.period_label ? ` · ${row.period_label}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <div style={styles.amount}>{formatChargeAmountIls(Number(row.amount))}</div>
                      <span
                        style={{
                          ...styles.badge,
                          background: `${color}22`,
                          color,
                        }}
                      >
                        {COLLECTION_CHARGE_STATUS_LABELS[status] || status}
                      </span>
                    </div>
                  </div>
                  <div style={styles.cardDates}>
                    נשלח: {formatDateHe(row.sent_at)} · שולם: {formatDateHe(row.paid_at)}
                  </div>
                  <div style={{ ...styles.actions, flexWrap: 'wrap' }}>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void copyPayLink(row)}
                    >
                      העתק קישור
                    </Button>
                    {(status === 'draft' || status === 'failed') && (
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
                        שלח
                      </Button>
                    )}
                    {(status === 'sent' || status === 'draft') && (
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
                        שלח SMS שוב
                      </Button>
                    )}
                    {status !== 'paid' && status !== 'cancelled' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void postChargeAction(
                            '/api/collections/charges/cancel',
                            row.id,
                            'החיוב בוטל וקישור Bamakor בוטל'
                          )
                        }
                      >
                        בטל
                      </Button>
                    )}
                    {status !== 'paid' && status !== 'cancelled' && status !== 'draft' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          if (
                            !window.confirm(
                              'לסמן את החיוב כשולם ידנית? השתמשו רק אם הדייר שילם והסטטוס לא התעדכן אוטומטית.'
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
                        סמן כשולם
                      </Button>
                    )}
                    {(row.grow_payment_link_id || row.greeninvoice_document_id) && (
                      <span style={styles.docId}>
                        {row.grow_payment_link_id
                          ? `Grow: ${row.grow_payment_link_id.slice(0, 8)}…`
                          : `מסמך: ${row.greeninvoice_document_id!.slice(0, 8)}…`}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

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
          <label style={styles.label}>בניין</label>
          <Select
            value={cProjectId}
            onChange={(v) => void onCreateProjectChange(v)}
            options={projects.map((p) => ({ label: p.name, value: p.id }))}
            placeholder="בחרו בניין"
            style={{ width: '100%' }}
          />
          <label style={styles.label}>דייר</label>
          <Select
            value={cResidentId}
            onChange={setCResidentId}
            options={cResidents.map((r) => ({
              label: `${r.full_name}${r.apartment_number ? ` · ${r.apartment_number}` : ''}`,
              value: r.id,
            }))}
            placeholder="בחרו דייר"
            style={{ width: '100%' }}
          />
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

function Chip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ ...styles.chip, borderColor: `${color}55` }}>
      <span style={{ ...styles.chipValue, color }}>{value}</span>
      <span style={styles.chipLabel}>{label}</span>
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  toolbar: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  settingsLink: {
    color: theme.colors.primary,
    fontSize: 14,
    fontWeight: 600,
  },
  chips: {
    display: 'flex',
    gap: 10,
  },
  chip: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '12px 14px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
  },
  chipValue: {
    fontSize: 22,
    fontWeight: 800,
  },
  chipLabel: {
    fontSize: 13,
    color: theme.colors.textSecondary,
  },
  filters: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  textInput: {
    padding: '10px 14px',
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
  cardInner: {
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
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
  },
  amount: {
    fontSize: 18,
    fontWeight: 800,
    color: theme.colors.textPrimary,
  },
  badge: {
    display: 'inline-block',
    marginTop: 6,
    padding: '2px 8px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
  },
  cardDates: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  actions: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
  },
  docId: {
    fontSize: 11,
    color: theme.colors.textMuted,
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
}
