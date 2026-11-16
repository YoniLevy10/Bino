'use client'

/**
 * דף אנשי מקצוע — קשרים חיצוניים (קבלנים, חשמלאים וכו').
 * העברת תקלות מתבצעת מדף התקלות ב-SMS.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast, asyncHandler, errorMessageFromResponseJson } from '@/lib/error-handler'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'
import { TM } from '@/lib/toast-messages'
import { validateRequired, validatePhoneNumber } from '@/lib/validators'
import {
  sanitizeExtraPhones,
  formatWorkerPhonesDisplay,
  formatWorkerPhoneDisplay,
  normalizeWorkerPhone,
  MAX_WORKER_EXTRA_PHONES,
} from '@/lib/worker-phones'
import {
  MobileHeader,
  useMobileMenu,
  PageHeader,
  KpiCard,
  KpiRow,
  Card,
  Button,
  SearchInput,
  Select,
  Drawer,
  EmptyState,
  LoadingSpinner,
  theme
} from '@/app/components/ui'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { PageTransitionLoader } from '@/app/components/page-skeleton'
import { PaidAddonGate } from '@/app/components/PaidAddonGate'
import {
  MidragSearchPanel,
  focusMidragSearch,
} from '@/app/components/professionals/MidragSearchPanel'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import type { FixlyDirectoryPerson } from '@/lib/fixly/pro-waitlist-directory'
import {
  PROFESSIONALS_PAGE_SIZE,
  fetchProfessionalsPage,
  isProfessionalsTableMissing,
  useTenantProfessionalsList,
} from '@/lib/hooks/use-professionals-list'
import { queryKeys } from '@/lib/query-keys'
import { ProfessionalRatingStars } from '@/app/components/professionals/ProfessionalRatingStars'

type ProfessionalRow = {
  id: string
  full_name: string
  phone: string | null
  extra_phones?: string[] | null
  trade?: string | null
  company_name?: string | null
  email?: string | null
  notes?: string | null
  personal_rating?: number | null
  personal_note?: string | null
  use_count?: number | null
  last_contacted_at?: string | null
  is_active: boolean
  source?: 'local' | 'fixly'
}

type ProfessionalForm = {
  full_name: string
  phone: string
  extra_phones: string[]
  trade: string
  company_name: string
  email: string
  notes: string
  personal_rating: number | null
  personal_note: string
  is_active: boolean
}

const emptyForm: ProfessionalForm = {
  full_name: '',
  phone: '',
  extra_phones: [],
  trade: '',
  company_name: '',
  email: '',
  notes: '',
  personal_rating: null,
  personal_note: '',
  is_active: true,
}

export default function ProfessionalsPage() {
  const { openMenu } = useMobileMenu()
  const queryClient = useQueryClient()
  const deepLinkOpened = useRef(false)
  const {
    clientId: rqClientId,
    professionals: rqProfessionals,
    hasMore: rqHasMore,
    isLoading: rqLoading,
    hasData: rqHasData,
    error: rqError,
    refetch: refetchProfessionals,
  } = useTenantProfessionalsList()
  const [rows, setRows] = useState<ProfessionalRow[]>([])
  const [clientId, setClientId] = useState('')
  const [extraRows, setExtraRows] = useState<ProfessionalRow[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [tableMissing, setTableMissing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [isMobile, setIsMobile] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [midragDrawerOpen, setMidragDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<ProfessionalRow | null>(null)
  const [form, setForm] = useState<ProfessionalForm>(emptyForm)
  const [fixlyPeople, setFixlyPeople] = useState<FixlyDirectoryPerson[]>([])
  const [fixlyLoading, setFixlyLoading] = useState(true)

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (rqClientId) setClientId(rqClientId)
  }, [rqClientId])

  useEffect(() => {
    if (!rqHasData) return
    setRows(rqProfessionals as ProfessionalRow[])
    setExtraRows([])
    setHasMore(rqHasMore)
    setTableMissing(false)
  }, [rqProfessionals, rqHasData, rqHasMore])

  useEffect(() => {
    if (!rqError) return
    if (isProfessionalsTableMissing(rqError as { message?: string })) {
      setTableMissing(true)
      setRows([])
    } else {
      toast.error(TM.genericLoadError)
    }
  }, [rqError])

  // Deep link from recommendations: /professionals?id=…&focus=rating
  useEffect(() => {
    if (deepLinkOpened.current || !rqHasData) return
    if (typeof window === 'undefined') return
    const id = new URLSearchParams(window.location.search).get('id')
    if (!id) return
    const row = rqProfessionals.find((r) => r.id === id) as ProfessionalRow | undefined
    if (!row || row.source === 'fixly') return
    deepLinkOpened.current = true
    setEditing(row)
    setForm({
      full_name: row.full_name || '',
      phone: row.phone ? formatWorkerPhoneDisplay(row.phone) : '',
      extra_phones: (row.extra_phones ?? []).map((p) => formatWorkerPhoneDisplay(p)),
      trade: row.trade || '',
      company_name: row.company_name || '',
      email: row.email || '',
      notes: row.notes || '',
      personal_rating:
        typeof row.personal_rating === 'number' && row.personal_rating >= 1
          ? row.personal_rating
          : null,
      personal_note: row.personal_note || '',
      is_active: row.is_active,
    })
    setDrawerOpen(true)
  }, [rqHasData, rqProfessionals])

  const allRows = useMemo(() => {
    if (extraRows.length === 0) return rows
    const seen = new Set(rows.map((r) => r.id))
    return [...rows, ...extraRows.filter((r) => !seen.has(r.id))]
  }, [rows, extraRows])

  const listed = useMemo(() => {
    const localPhones = new Set(
      allRows
        .map((row) => (row.phone ? normalizeWorkerPhone(row.phone) : ''))
        .filter(Boolean)
    )
    const fromFixly: ProfessionalRow[] = fixlyPeople.flatMap((person) => {
      const phone = person.phone?.trim()
      const normalized = phone ? normalizeWorkerPhone(phone) : ''
      if (normalized && localPhones.has(normalized)) return []
      return [
        {
          id: `fixly:${person.id}`,
          full_name: person.full_name,
          phone: phone || null,
          trade: person.category,
          company_name: person.city,
          email: person.email,
          notes: null,
          is_active: true,
          source: 'fixly' as const,
        },
      ]
    })
    return [...allRows.map((row) => ({ ...row, source: row.source ?? ('local' as const) })), ...fromFixly].sort(
      (a, b) => a.full_name.localeCompare(b.full_name, 'he')
    )
  }, [allRows, fixlyPeople])

  const loading =
    listed.length === 0 &&
    !tableMissing &&
    ((rqLoading && rows.length === 0) || fixlyLoading)

  async function loadProfessionals() {
    const cid = clientId || rqClientId
    if (cid) {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.professionals(cid, PROFESSIONALS_PAGE_SIZE),
      })
    }
    setExtraRows([])
    await refetchProfessionals()
  }

  async function loadMoreProfessionals() {
    const cid = clientId || rqClientId
    if (!cid || loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const page = await fetchProfessionalsPage(cid, {
        offset: allRows.length,
        limit: PROFESSIONALS_PAGE_SIZE,
      })
      setExtraRows((prev) => [...prev, ...page.rows])
      setHasMore(page.hasMore)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : TM.genericLoadError)
    } finally {
      setLoadingMore(false)
    }
  }

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setDrawerOpen(true)
  }

  function openEdit(row: ProfessionalRow) {
    setEditing(row)
    setForm({
      full_name: row.full_name || '',
      phone: row.phone ? formatWorkerPhoneDisplay(row.phone) : '',
      extra_phones: (row.extra_phones ?? []).map((p) => formatWorkerPhoneDisplay(p)),
      trade: row.trade || '',
      company_name: row.company_name || '',
      email: row.email || '',
      notes: row.notes || '',
      personal_rating:
        typeof row.personal_rating === 'number' && row.personal_rating >= 1
          ? row.personal_rating
          : null,
      personal_note: row.personal_note || '',
      is_active: row.is_active,
    })
    setDrawerOpen(true)
  }

  /** Fixly directory rows are read-only — seed a local create form so they can be saved to the book. */
  function openCreateFromFixly(row: ProfessionalRow) {
    setEditing(null)
    setForm({
      ...emptyForm,
      full_name: row.full_name || '',
      phone: row.phone ? formatWorkerPhoneDisplay(row.phone) : '',
      trade: row.trade || '',
      company_name: row.company_name || '',
      email: row.email || '',
      notes: row.notes || '',
      is_active: true,
    })
    setDrawerOpen(true)
  }

  function closeDrawer() {
    if (saving) return
    setDrawerOpen(false)
    setEditing(null)
    setForm(emptyForm)
  }

  function updateForm<K extends keyof ProfessionalForm>(key: K, value: ProfessionalForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function updateExtraPhone(index: number, value: string) {
    setForm((prev) => {
      const next = [...prev.extra_phones]
      next[index] = value
      return { ...prev, extra_phones: next }
    })
  }

  function addExtraPhoneField() {
    setForm((prev) => {
      if (prev.extra_phones.length >= MAX_WORKER_EXTRA_PHONES) return prev
      return { ...prev, extra_phones: [...prev.extra_phones, ''] }
    })
  }

  function removeExtraPhone(index: number) {
    setForm((prev) => ({
      ...prev,
      extra_phones: prev.extra_phones.filter((_, i) => i !== index),
    }))
  }

  function blurPhoneField(value: string): string {
    const normalized = normalizeWorkerPhone(value)
    return normalized ? formatWorkerPhoneDisplay(normalized) : value.trim()
  }

  function blurPrimaryPhone() {
    setForm((prev) => ({ ...prev, phone: blurPhoneField(prev.phone) }))
  }

  function blurExtraPhone(index: number) {
    setForm((prev) => {
      const next = [...prev.extra_phones]
      next[index] = blurPhoneField(next[index] ?? '')
      return { ...prev, extra_phones: next }
    })
  }

  function validateForm(): string {
    const nameErr = validateRequired(form.full_name, 'שם')
    if (nameErr) return 'נא למלא שם מלא'
    const phoneErr = validatePhoneNumber(form.phone, 'טלפון')
    if (phoneErr) return 'נא להזין מספר טלפון ראשי תקין'
    for (let i = 0; i < form.extra_phones.length; i++) {
      const extra = form.extra_phones[i]?.trim()
      if (!extra) continue
      const extraErr = validatePhoneNumber(extra, `טלפון נוסף ${i + 1}`)
      if (extraErr) return 'מספר טלפון נוסף לא תקין'
    }
    const extraSanitized = sanitizeExtraPhones(form.phone, form.extra_phones)
    if (!extraSanitized.ok) return extraSanitized.error
    return ''
  }

  async function saveProfessional() {
    const errMsg = validateForm()
    if (errMsg) {
      toast.error(errMsg)
      return
    }
    const extraSanitized = sanitizeExtraPhones(form.phone, form.extra_phones)
    if (!extraSanitized.ok) {
      toast.error(extraSanitized.error)
      return
    }

    setSaving(true)
    await asyncHandler(
      async () => {
        const payload = {
          full_name: form.full_name.trim(),
          phone: form.phone.trim(),
          extra_phones: extraSanitized.phones,
          trade: form.trade.trim() || null,
          company_name: form.company_name.trim() || null,
          email: form.email.trim() || null,
          notes: form.notes.trim() || null,
          personal_rating: form.personal_rating,
          personal_note: form.personal_note.trim() || null,
          is_active: form.is_active,
          updated_at: new Date().toISOString(),
        }

        if (editing) {
          const res = await fetchWithTimeout(
            '/api/update-professional',
            {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                professional_id: editing.id,
                full_name: payload.full_name,
                phone: payload.phone,
                extra_phones: payload.extra_phones,
                trade: payload.trade,
                company_name: payload.company_name,
                email: payload.email,
                notes: payload.notes,
                personal_rating: payload.personal_rating,
                personal_note: payload.personal_note,
                is_active: payload.is_active,
              }),
            },
            MUTATION_FETCH_TIMEOUT_MS
          )
          const json = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(errorMessageFromResponseJson(json, 'עדכון נכשל'))
          toast.success(TM.professionalUpdated)
        } else {
          const res = await fetchWithTimeout(
            '/api/create-professional',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                full_name: payload.full_name,
                phone: payload.phone,
                extra_phones: payload.extra_phones,
                trade: payload.trade,
                company_name: payload.company_name,
                email: payload.email || '',
                notes: payload.notes,
                personal_rating: payload.personal_rating,
                personal_note: payload.personal_note,
                is_active: payload.is_active,
              }),
            },
            MUTATION_FETCH_TIMEOUT_MS
          )
          const json = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(errorMessageFromResponseJson(json, 'יצירה נכשלה'))
          toast.success(TM.professionalCreated)
        }

        await loadProfessionals()
        closeDrawer()
        return true
      },
      { context: 'שמירת איש מקצוע', showErrorToast: true }
    )
    setSaving(false)
  }

  async function quickRate(row: ProfessionalRow, next: number) {
    if (row.source === 'fixly') return
    await asyncHandler(
      async () => {
        const res = await fetchWithTimeout(
          '/api/update-professional',
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              professional_id: row.id,
              personal_rating: next,
            }),
          },
          MUTATION_FETCH_TIMEOUT_MS
        )
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(errorMessageFromResponseJson(json, 'עדכון דירוג נכשל'))
        setRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, personal_rating: next } : r))
        )
        setExtraRows((prev) =>
          prev.map((r) => (r.id === row.id ? { ...r, personal_rating: next } : r))
        )
        if (clientId) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.professionalsActiveAssign(clientId) })
        }
        return true
      },
      { context: 'דירוג איש מקצוע', showErrorToast: true }
    )
  }

  async function toggleActive(row: ProfessionalRow) {
    await asyncHandler(
      async () => {
        const res = await fetchWithTimeout('/api/update-professional', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ professional_id: row.id, is_active: !row.is_active }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((json as { error?: string }).error || 'עדכון נכשל')
        await loadProfessionals()
        return true
      },
      { context: 'עדכון סטטוס', showErrorToast: true }
    )
  }

  async function removeProfessional(row: ProfessionalRow) {
    if (!window.confirm(`להסיר את ${row.full_name} מרשימת אנשי המקצוע?`)) return
    await asyncHandler(
      async () => {
        const res = await fetchWithTimeout('/api/delete-professional', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ professional_id: row.id }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((json as { error?: string }).error || 'מחיקה נכשלה')
        toast.success(TM.professionalDeleted)
        await loadProfessionals()
        if (editing?.id === row.id) closeDrawer()
        return true
      },
      { context: 'מחיקה', showErrorToast: true }
    )
  }

  const stats = useMemo(() => {
    const total = listed.length
    const active = listed.filter((r) => r.is_active).length
    const rated = listed.filter(
      (r) => typeof r.personal_rating === 'number' && r.personal_rating >= 1
    ).length
    return { total, active, rated, inactive: total - active }
  }, [listed])

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return listed.filter((r) => {
      const phoneDisplay = formatWorkerPhonesDisplay(r).toLowerCase()
      const matchQ =
        !q ||
        r.full_name.toLowerCase().includes(q) ||
        (r.phone || '').toLowerCase().includes(q) ||
        phoneDisplay.includes(q) ||
        (r.trade || '').toLowerCase().includes(q) ||
        (r.company_name || '').toLowerCase().includes(q)
      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && r.is_active) ||
        (statusFilter === 'INACTIVE' && !r.is_active)
      return matchQ && matchStatus
    })
  }, [listed, searchTerm, statusFilter])

  return (
    <>
      {isMobile && (
        <MobileHeader
          title="אנשי מקצוע"
          subtitle={`${filtered.length} אנשי קשר`}
          onMenuClick={openMenu}
        />
      )}

      <div style={{ ...styles.content, ...(isMobile ? styles.contentMobile : {}) }}>
        {!isMobile && (
          <PageHeader
            title="אנשי מקצוע"
            subtitle="פנקס קבלנים עם דירוג והערה אישיים — ממוין לפי איכות ושימוש בהעברת תקלות"
            actions={
              <Button variant="primary" onClick={openCreate} disabled={tableMissing}>
                איש מקצוע חדש
              </Button>
            }
          />
        )}

        {tableMissing && (
          <Card>
            <p style={styles.migrationHint}>
              פנקס אנשי המקצוע אינו זמין כרגע. פנו לתמיכה.
            </p>
          </Card>
        )}

        <PaidAddonGate addonKey={PAID_ADDON_KEYS.professionals}>
        <FixlyDirectoryLoader onPeople={setFixlyPeople} onLoading={setFixlyLoading} />
        {loading ? (
          <PageTransitionLoader />
        ) : (
          <>
            <KpiRow columns={isMobile ? 2 : 4} isMobile={isMobile}>
              <KpiCard label="סה״כ" value={stats.total} accent="primary" />
              <KpiCard label="פעילים" value={stats.active} accent="success" />
              <KpiCard label="עם דירוג" value={stats.rated} accent="warning" />
              <KpiCard label="לא פעילים" value={stats.inactive} />
            </KpiRow>

            <div style={{ marginBottom: 24, minWidth: 0, maxWidth: '100%', overflowX: 'hidden' }}>
              <MidragSearchPanel
                isMobile={isMobile}
                drawerOpen={midragDrawerOpen}
                onDrawerOpenChange={setMidragDrawerOpen}
              />
            </div>

            <Card noPadding>
              <div style={{ ...styles.filters, flexDirection: isMobile ? 'column' : 'row' }}>
                <SearchInput
                  value={searchTerm}
                  onChange={setSearchTerm}
                  placeholder="חיפוש לפי שם, תחום, עיר או טלפון..."
                  style={{ flex: 1, maxWidth: isMobile ? '100%' : 320 }}
                />
                <Select
                  value={statusFilter}
                  onChange={(v) => setStatusFilter(v as typeof statusFilter)}
                  options={[
                    { label: 'הכל', value: 'ALL' },
                    { label: 'פעיל', value: 'ACTIVE' },
                    { label: 'לא פעיל', value: 'INACTIVE' },
                  ]}
                />
                {isMobile && (
                  <Button variant="primary" onClick={openCreate} disabled={tableMissing}>
                    איש מקצוע חדש
                  </Button>
                )}
              </div>

              {filtered.length === 0 ? (
                <EmptyState
                  title="לא נמצאו אנשי מקצוע"
                  description="הוסיפו איש קשר, או חפשו קבלן במידרג לפי מקצוע ועיר."
                  action={
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                      <Button variant="primary" onClick={openCreate} disabled={tableMissing}>
                        הוספה
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() =>
                          focusMidragSearch({
                            isMobile,
                            openDrawer: () => setMidragDrawerOpen(true),
                          })
                        }
                      >
                        חיפוש במידרג
                      </Button>
                    </div>
                  }
                />
              ) : (
                <div style={styles.list}>
                  {filtered.map((row) => (
                    <div key={row.id} style={styles.card} data-ui="card">
                      <div style={styles.cardHeader}>
                        <div>
                          <div style={styles.name}>{row.full_name}</div>
                          <div style={styles.sub}>
                            {[row.trade, row.company_name].filter(Boolean).join(' · ') || 'ללא תחום'}
                          </div>
                        </div>
                        <span style={statusPill(row.is_active)}>{row.is_active ? 'פעיל' : 'לא פעיל'}</span>
                      </div>
                      <div style={styles.phone}>{formatWorkerPhonesDisplay(row)}</div>
                      {row.source === 'fixly' ? null : (
                        <div style={{ marginBottom: 8 }}>
                          <ProfessionalRatingStars
                            rating={row.personal_rating}
                            size="md"
                            showEmptyLabel
                            caption={
                              (row.use_count ?? 0) > 0
                                ? `${row.use_count} העברות מוצלחות`
                                : 'עדיין לא הועברה תקלה'
                            }
                            onChange={(next) => void quickRate(row, next)}
                          />
                        </div>
                      )}
                      {row.personal_note ? (
                        <div style={styles.personalNoteBox}>{row.personal_note}</div>
                      ) : null}
                      {row.notes ? <div style={styles.notes}>{row.notes}</div> : null}
                      {row.source === 'fixly' ? (
                        <div style={styles.actions}>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openCreateFromFixly(row)}
                            disabled={tableMissing}
                          >
                            הוסף לפנקס
                          </Button>
                        </div>
                      ) : (
                        <div style={styles.actions}>
                          <Button variant="secondary" size="sm" onClick={() => openEdit(row)}>
                            עריכה
                          </Button>
                          <Button variant="secondary" size="sm" onClick={() => void toggleActive(row)}>
                            {row.is_active ? 'השבתה' : 'הפעלה'}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => void removeProfessional(row)}>
                            הסרה
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {hasMore && !searchTerm.trim() && statusFilter === 'ALL' ? (
                <div style={{ padding: 16, display: 'flex', justifyContent: 'center' }}>
                  <Button
                    type="button"
                    variant="secondary"
                    loading={loadingMore}
                    onClick={() => void loadMoreProfessionals()}
                  >
                    טען עוד
                  </Button>
                </div>
              ) : null}
            </Card>
          </>
        )}
        </PaidAddonGate>
      </div>

      <PaidAddonGate addonKey={PAID_ADDON_KEYS.professionals}>
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editing ? 'עריכת איש מקצוע' : 'איש מקצוע חדש'}
        subtitle="טלפונים להעברה ב-SMS · דירוג והערה אישיים לזיכרון תפעולי"
        isMobile={isMobile}
        footer={
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={closeDrawer} disabled={saving}>
              ביטול
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void saveProfessional()}>
              שמירה
            </Button>
          </div>
        }
      >
        <div style={styles.form}>
          <label style={styles.label}>שם מלא *</label>
          <input
            className="app-input"
            value={form.full_name}
            onChange={(e) => updateForm('full_name', e.target.value)}
            style={styles.input}
          />
          <label style={styles.label}>טלפון ראשי *</label>
          <input
            type="tel"
            inputMode="tel"
            className="app-input"
            value={form.phone}
            onChange={(e) => updateForm('phone', e.target.value)}
            onBlur={blurPrimaryPhone}
            placeholder="05X-XXX-XXXX"
            style={styles.input}
          />
          <p style={styles.formHint}>05X-XXX-XXXX, 05XXXXXXXX, +972... או 972... (עם או בלי מקפים)</p>
          <div style={styles.extraPhonesHeader}>
            <label style={styles.label}>טלפונים נוספים (SMS)</label>
            {form.extra_phones.length < MAX_WORKER_EXTRA_PHONES ? (
              <Button variant="ghost" size="sm" type="button" onClick={addExtraPhoneField}>
                + הוסף מספר
              </Button>
            ) : null}
          </div>
          <p style={styles.formHint}>
            למשל טלפון עבודה — כל המספרים יכולים לקבל SMS בהעברת תקלה
          </p>
          {form.extra_phones.length === 0 ? (
            <Button variant="secondary" size="sm" type="button" onClick={addExtraPhoneField}>
              הוסף טלפון נוסף
            </Button>
          ) : (
            <div style={styles.extraPhoneList}>
              {form.extra_phones.map((extraPhone, index) => (
                <div key={index} style={styles.extraPhoneRow}>
                  <input
                    type="tel"
                    inputMode="tel"
                    className="app-input"
                    value={extraPhone}
                    onChange={(e) => updateExtraPhone(index, e.target.value)}
                    onBlur={() => blurExtraPhone(index)}
                    placeholder="05X-XXX-XXXX"
                    style={{ ...styles.input, flex: 1, minWidth: 0 }}
                  />
                  <Button variant="ghost" size="sm" type="button" onClick={() => removeExtraPhone(index)}>
                    הסר
                  </Button>
                </div>
              ))}
            </div>
          )}
          <label style={styles.label}>תחום (חשמל, אינסטלציה...)</label>
          <input
            className="app-input"
            value={form.trade}
            onChange={(e) => updateForm('trade', e.target.value)}
            style={styles.input}
          />
          <label style={styles.label}>חברה</label>
          <input
            className="app-input"
            value={form.company_name}
            onChange={(e) => updateForm('company_name', e.target.value)}
            style={styles.input}
          />
          <label style={styles.label}>אימייל (אופציונלי)</label>
          <input
            type="email"
            className="app-input"
            value={form.email}
            onChange={(e) => updateForm('email', e.target.value)}
            style={styles.input}
          />
          <label style={styles.label}>דירוג אישי</label>
          <ProfessionalRatingStars
            rating={form.personal_rating}
            size="md"
            showEmptyLabel
            allowClear
            onClear={() => updateForm('personal_rating', null)}
            onChange={(next) => updateForm('personal_rating', next)}
          />
          <label style={styles.label}>הערה אישית (למנהל)</label>
          <textarea
            value={form.personal_note}
            onChange={(e) => updateForm('personal_note', e.target.value)}
            rows={2}
            placeholder="למשל: מגיע מהר, יקר בערב…"
            style={styles.input}
          />
          <label style={styles.label}>הערות כלליות</label>
          <textarea
            value={form.notes}
            onChange={(e) => updateForm('notes', e.target.value)}
            rows={3}
            style={styles.input}
          />
          <label style={styles.checkRow}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => updateForm('is_active', e.target.checked)}
            />
            פעיל (מופיע ברשימת העברה מתקלה)
          </label>
        </div>
      </Drawer>
      </PaidAddonGate>
    </>
  )
}

function FixlyDirectoryLoader({
  onPeople,
  onLoading,
}: {
  onPeople: (rows: FixlyDirectoryPerson[]) => void
  onLoading: (loading: boolean) => void
}) {
  useEffect(() => {
    const ac = new AbortController()
    onLoading(true)
    void fetchWithTimeout('/api/professionals/fixly-directory', { signal: ac.signal })
      .then(async (res) => {
        const json = (await res.json().catch(() => ({}))) as {
          rows?: FixlyDirectoryPerson[]
          error?: unknown
        }
        if (!res.ok) {
          throw new Error(errorMessageFromResponseJson(json, TM.genericLoadError))
        }
        if (ac.signal.aborted) return
        onPeople(Array.isArray(json.rows) ? json.rows : [])
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        if (e instanceof DOMException && e.name === 'AbortError') return
        toast.error(e instanceof Error ? e.message : TM.genericLoadError)
      })
      .finally(() => {
        if (!ac.signal.aborted) onLoading(false)
      })
    return () => ac.abort()
  }, [onPeople, onLoading])

  return null
}

function statusPill(active: boolean): CSSProperties {
  return {
    padding: '4px 10px',
    borderRadius: theme.radius.full,
    fontSize: 11,
    fontWeight: 600,
    background: active ? theme.colors.successMuted : theme.colors.muted,
    color: active ? theme.colors.success : theme.colors.textMuted,
  }
}

const styles: Record<string, CSSProperties> = {
  content: {
    padding: '32px 40px 48px',
    maxWidth: 1200,
    margin: '0 auto',
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    overflowX: 'hidden',
  },
  contentMobile: {
    padding: '16px 16px 80px',
    maxWidth: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    overflowX: 'hidden',
  },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginBottom: 24 },
  filters: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    padding: '16px 20px',
    borderBottom: `1px solid ${theme.colors.border}`,
    background: theme.colors.mutedSurface,
    minWidth: 0,
    maxWidth: '100%',
    boxSizing: 'border-box',
  },
  list: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
    gap: 14,
    padding: 20,
    minWidth: 0,
    maxWidth: '100%',
    boxSizing: 'border-box',
  },
  card: {
    padding: '16px 18px',
    borderRadius: theme.radius.xl,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    boxShadow: theme.shadows.xs,
    minWidth: 0,
    maxWidth: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden',
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8, minWidth: 0 },
  name: {
    fontSize: 16,
    fontWeight: 600,
    color: theme.colors.textPrimary,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  },
  sub: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginTop: 2,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  },
  phone: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 8,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  },
  notes: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginBottom: 12,
    lineHeight: 1.4,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  },
  personalNoteBox: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    marginBottom: 12,
    lineHeight: 1.45,
    padding: '8px 10px',
    borderRadius: theme.radius.md,
    background: theme.colors.mutedSurface,
    border: `1px solid ${theme.colors.borderSubtle}`,
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
  },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 8, minWidth: 0 },
  form: { display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, maxWidth: '100%' },
  label: { fontSize: 13, fontWeight: 600, color: theme.colors.textSecondary },
  formHint: {
    margin: 0,
    fontSize: 12,
    color: theme.colors.textMuted,
    lineHeight: 1.4,
  },
  extraPhonesHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minWidth: 0,
  },
  extraPhoneList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    minWidth: 0,
  },
  extraPhoneRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    fontSize: 15,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    background: theme.colors.surface,
    color: theme.colors.textPrimary,
    maxWidth: '100%',
    minWidth: 0,
  },
  checkRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' },
  migrationHint: { margin: 0, fontSize: 14, lineHeight: 1.5, color: theme.colors.textSecondary },
  code: {
    fontSize: 13,
    background: theme.colors.mutedSurface,
    padding: '2px 6px',
    borderRadius: theme.radius.xs,
  },
}
