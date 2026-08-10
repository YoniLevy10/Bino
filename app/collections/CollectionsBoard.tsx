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
  in_process: number
  cancelled: number
  failed: number
}

type BulkPreviewRow = ResidentOption & { amount: string; selected: boolean }

function residentPhone(r: { phone: string | null; normalized_phone?: string | null }): string {
  return (r.normalized_phone || r.phone || '').trim()
}

export function CollectionsBoard() {
  const [isMobile, setIsMobile] = useState(false)
  const [loading, setLoading] = useState(true)
  const [clientId, setClientId] = useState('')
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [items, setItems] = useState<CollectionChargeListItem[]>([])
  const [chips, setChips] = useState<SummaryChips>({
    sent: 0,
    paid: 0,
    in_process: 0,
    cancelled: 0,
    failed: 0,
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
  const [cTitle, setCTitle] = useState('ועד בית')
  const [cAmount, setCAmount] = useState('')
  const [cDescription, setCDescription] = useState('')
  const [cPeriod, setCPeriod] = useState('')
  const [cSaving, setCSaving] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
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
      chips?: Partial<SummaryChips> & { pending?: number }
      counts?: SummaryChips & { draft?: number }
      error?: string
    }
    if (sumRes.ok) {
      if (sumJson.chips) {
        setChips({
          sent: sumJson.chips.sent ?? 0,
          paid: sumJson.chips.paid ?? 0,
          in_process: sumJson.chips.in_process ?? sumJson.counts?.draft ?? 0,
          cancelled: sumJson.chips.cancelled ?? sumJson.counts?.cancelled ?? 0,
          failed: sumJson.chips.failed ?? 0,
        })
      }
    }
  }, [periodFilter, projectFilter, searchTerm, statusFilter])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      await asyncHandler(
        async () => {
          const cid = await resolveBamakorClientIdForBrowser()
          setClientId(cid)
          await loadProjects(cid)
          return true
        },
        { context: 'טעינת גביית ועד', showErrorToast: true }
      )
      setLoading(false)
    })()
  }, [loadProjects])

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

  async function openPayPage(row: CollectionChargeListItem) {
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}/pay/${row.public_token}`
        : `/pay/${row.public_token}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function openReceipt(row: CollectionChargeListItem) {
    if (row.greeninvoice_payment_url) {
      window.open(row.greeninvoice_payment_url, '_blank', 'noopener,noreferrer')
      return
    }
    await openPayPage(row)
  }

  function printReport() {
    window.print()
  }

  const statusOptions = useMemo(
    () => [
      { label: 'כל הסטטוסים', value: 'all' },
      { label: 'בתהליך', value: 'draft' },
      { label: 'נשלח והועבר', value: 'sent' },
      { label: 'שולם', value: 'paid' },
      { label: 'חריג', value: 'failed' },
      { label: 'בוטל', value: 'cancelled' },
    ],
    []
  )

  const projectOptions = useMemo(
    () => [
      { label: 'כל הדירות / בניינים', value: '' },
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
      <div style={styles.heroActions}>
        <Button
          variant="primary"
          onClick={() => void openBulk()}
          style={styles.primaryCta}
        >
          <SendIcon />
          שליחת דרישת תשלום
        </Button>
        <div style={{ ...styles.secondaryRow, flexDirection: isMobile ? 'column' : 'row' }}>
          <Button variant="secondary" onClick={printReport} style={{ flex: 1 }}>
            <PrintIcon />
            דוח גבייה
          </Button>
          <Link href="/settings?tab=morning" style={{ flex: 1, textDecoration: 'none' }}>
            <Button variant="secondary" style={{ width: '100%' }}>
              <GearIcon />
              הגדרות
            </Button>
          </Link>
        </div>
        <p style={styles.partnerNote}>
          בשיתוף <span style={styles.partnerBrand}>morning</span>
        </p>
      </div>

      <div style={styles.chips}>
        <Chip label="נשלחו" value={chips.sent} tone="primary" icon="send" />
        <Chip label="שולמו" value={chips.paid} tone="success" icon="check" />
        <Chip label="בתהליך" value={chips.in_process} tone="warning" icon="clock" />
        <Chip label="בוטלו" value={chips.cancelled} tone="muted" icon="cancel" />
        <Chip label="חריגים" value={chips.failed} tone="error" icon="alert" />
      </div>

      <div style={{ ...styles.filters, flexDirection: isMobile ? 'column' : 'row' }}>
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          options={statusOptions}
          style={{ minWidth: isMobile ? '100%' : 150 }}
        />
        <Select
          value={projectFilter}
          onChange={setProjectFilter}
          options={projectOptions}
          style={{ minWidth: isMobile ? '100%' : 160 }}
        />
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="חיפוש שם / מספר דירה"
          style={{ flex: 1, maxWidth: isMobile ? '100%' : 280 }}
        />
        <input
          value={periodFilter}
          onChange={(e) => setPeriodFilter(e.target.value)}
          placeholder="2026-07"
          style={{ ...styles.textInput, maxWidth: isMobile ? '100%' : 120 }}
          aria-label="תקופה"
        />
        <Button variant="secondary" size="sm" onClick={() => void openCreate()}>
          חיוב בודד
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="אין חיובים להצגה"
          description="לחצו על «שליחת דרישת תשלום» כדי להתחיל גבייה לבניין."
        />
      ) : (
        <div style={styles.list}>
          {items.map((row) => {
            const status = row.status as CollectionChargeStatus
            const color = COLLECTION_CHARGE_STATUS_COLORS[status] || theme.colors.textMuted
            const busy = busyId === row.id
            const apt = row.residents?.apartment_number
            return (
              <Card key={row.id} noPadding>
                <div style={styles.cardInner}>
                  <div style={styles.cardTop}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={styles.cardName}>{row.residents?.full_name || 'דייר'}</div>
                      <div style={styles.cardMeta}>
                        {apt ? `דירה ${apt}` : 'דירה —'}
                        {row.projects?.name ? ` · ${row.projects.name}` : ''}
                      </div>
                      <div style={styles.cardMetaSoft}>
                        {row.title}
                        {row.period_label ? ` · ${row.period_label}` : ''}
                      </div>
                    </div>
                    <div style={styles.cardAside}>
                      <div style={styles.amount}>{formatChargeAmountIls(Number(row.amount))}</div>
                      <span style={{ ...styles.badge, background: `${color}18`, color }}>
                        {COLLECTION_CHARGE_STATUS_LABELS[status] || status}
                      </span>
                    </div>
                  </div>

                  <div style={styles.actions}>
                    {status === 'paid' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void openReceipt(row)}
                      >
                        הצגת קבלה
                      </Button>
                    )}
                    {status !== 'paid' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void openPayPage(row)}
                      >
                        הצגת דרישה
                      </Button>
                    )}
                    {(status === 'draft' || status === 'failed' || status === 'cancelled') && (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void postChargeAction(
                            '/api/collections/charges/send',
                            row.id,
                            'דרישת התשלום נשלחה'
                          )
                        }
                      >
                        שלח
                      </Button>
                    )}
                    {status === 'sent' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void postChargeAction(
                            '/api/collections/charges/resend',
                            row.id,
                            'הדרישה נשלחה מחדש'
                          )
                        }
                      >
                        שלח שוב
                      </Button>
                    )}
                    {status !== 'paid' && status !== 'cancelled' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          void postChargeAction(
                            '/api/collections/charges/cancel',
                            row.id,
                            'החיוב בוטל'
                          )
                        }
                      >
                        ביטול
                      </Button>
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
        title="שליחת דרישת תשלום"
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

function Chip({
  label,
  value,
  tone,
  icon,
}: {
  label: string
  value: number
  tone: 'primary' | 'success' | 'warning' | 'error' | 'muted'
  icon: 'send' | 'check' | 'clock' | 'cancel' | 'alert'
}) {
  const toneColor =
    tone === 'primary'
      ? theme.colors.primary
      : tone === 'success'
        ? theme.colors.success
        : tone === 'warning'
          ? theme.colors.warning
          : tone === 'error'
            ? theme.colors.error
            : theme.colors.textMuted

  return (
    <div style={styles.chip}>
      <div style={{ ...styles.chipIcon, background: `${toneColor}18`, color: toneColor }}>
        <ChipGlyph name={icon} />
      </div>
      <div style={styles.chipText}>
        <span style={{ ...styles.chipValue, color: toneColor }}>{value}</span>
        <span style={styles.chipLabel}>{label}</span>
      </div>
    </div>
  )
}

function ChipGlyph({ name }: { name: 'send' | 'check' | 'clock' | 'cancel' | 'alert' }) {
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  if (name === 'send') {
    return (
      <svg {...common}>
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
      </svg>
    )
  }
  if (name === 'check') {
    return (
      <svg {...common}>
        <path d="M20 6 9 17l-5-5" />
      </svg>
    )
  }
  if (name === 'clock') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    )
  }
  if (name === 'cancel') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="10" />
        <path d="m15 9-6 6" />
        <path d="m9 9 6 6" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  )
}

function PrintIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9V2h12v7" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v8H6z" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
    </svg>
  )
}

const styles: Record<string, CSSProperties> = {
  heroActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  primaryCta: {
    width: '100%',
    minHeight: 52,
    fontSize: 16,
    fontWeight: 700,
    background: theme.colors.primary,
    color: theme.colors.textInverse,
    border: 'none',
  },
  secondaryRow: {
    display: 'flex',
    gap: 10,
  },
  partnerNote: {
    margin: '2px 0 0',
    textAlign: 'center',
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  partnerBrand: {
    fontWeight: 700,
    color: theme.colors.textSecondary,
    letterSpacing: '0.02em',
  },
  chips: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))',
    gap: 8,
  },
  chip: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '12px 12px',
    borderRadius: theme.radius.lg,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    minWidth: 0,
  },
  chipIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  chipText: {
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
    minWidth: 0,
  },
  chipValue: {
    fontSize: 20,
    fontWeight: 800,
    lineHeight: 1.1,
  },
  chipLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: 500,
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
    gap: 12,
  },
  cardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 12,
    alignItems: 'flex-start',
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
  cardMetaSoft: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  cardAside: {
    textAlign: 'left',
    flexShrink: 0,
  },
  amount: {
    fontSize: 18,
    fontWeight: 800,
    color: theme.colors.textPrimary,
  },
  badge: {
    display: 'inline-block',
    marginTop: 6,
    padding: '3px 10px',
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
  },
  actions: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
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
