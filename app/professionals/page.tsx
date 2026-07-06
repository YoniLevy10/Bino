'use client'

/**
 * דף אנשי מקצוע — קשרים חיצוניים (קבלנים, חשמלאים וכו').
 * העברת תקלות מתבצעת מדף התקלות ב-SMS.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { resolveBamakorClientIdForBrowser } from '@/lib/bamakor-client'
import { withClientId } from '@/lib/supabase/with-client-id'
import { toast, asyncHandler, errorMessageFromResponseJson } from '@/lib/error-handler'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'
import { TM } from '@/lib/toast-messages'
import { validateRequired, validatePhoneNumber } from '@/lib/validators'
import {
  sanitizeExtraPhones,
  formatWorkerPhonesDisplay,
  MAX_WORKER_EXTRA_PHONES,
} from '@/lib/worker-phones'
import {
  AppShell,
  MobileHeader,
  useMobileMenu,
  PageHeader,
  KpiCard,
  Card,
  Button,
  SearchInput,
  Select,
  Drawer,
  EmptyState,
  LoadingSpinner,
  theme,
} from '../components/ui'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { PageKpiSkeletonN, PageListSkeleton } from '../components/page-skeleton'
import { PaidAddonGate } from '../components/PaidAddonGate'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'

type ProfessionalRow = {
  id: string
  full_name: string
  phone: string | null
  extra_phones?: string[] | null
  trade?: string | null
  company_name?: string | null
  email?: string | null
  notes?: string | null
  is_active: boolean
}

type ProfessionalForm = {
  full_name: string
  phone: string
  extra_phones: string[]
  trade: string
  company_name: string
  email: string
  notes: string
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
  is_active: true,
}

function isProfessionalsTableMissing(err: { message?: string } | null): boolean {
  if (!err?.message) return false
  const m = err.message.toLowerCase()
  return m.includes('professionals') && (m.includes('does not exist') || m.includes('schema cache'))
}

export default function ProfessionalsPage() {
  const { openMenu } = useMobileMenu()
  const [rows, setRows] = useState<ProfessionalRow[]>([])
  const [clientId, setClientId] = useState('')
  const [loading, setLoading] = useState(true)
  const [tableMissing, setTableMissing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [isMobile, setIsMobile] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<ProfessionalRow | null>(null)
  const [form, setForm] = useState<ProfessionalForm>(emptyForm)

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  async function loadProfessionals(nextClientId?: string) {
    const cid = nextClientId || clientId
    if (!cid) return
    const { data, error } = await withClientId(
      supabase.from('professionals').select('*'),
      cid
    )
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) {
      if (isProfessionalsTableMissing(error)) {
        setTableMissing(true)
        setRows([])
        return
      }
      throw error
    }
    setTableMissing(false)
    setRows((data as ProfessionalRow[]) || [])
  }

  useEffect(() => {
    void (async () => {
      setLoading(true)
      await asyncHandler(
        async () => {
          const cid = await resolveBamakorClientIdForBrowser()
          setClientId(cid)
          await loadProfessionals(cid)
          return true
        },
        { context: 'טעינת אנשי מקצוע', showErrorToast: true }
      )
      setLoading(false)
    })()
  }, [])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setDrawerOpen(true)
  }

  function openEdit(row: ProfessionalRow) {
    setEditing(row)
    setForm({
      full_name: row.full_name || '',
      phone: row.phone || '',
      extra_phones: [...(row.extra_phones ?? [])],
      trade: row.trade || '',
      company_name: row.company_name || '',
      email: row.email || '',
      notes: row.notes || '',
      is_active: row.is_active,
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
    const total = rows.length
    const active = rows.filter((r) => r.is_active).length
    return { total, active, inactive: total - active }
  }, [rows])

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return rows.filter((r) => {
      const matchQ =
        !q ||
        r.full_name.toLowerCase().includes(q) ||
        (r.phone || '').toLowerCase().includes(q) ||
        (r.trade || '').toLowerCase().includes(q) ||
        (r.company_name || '').toLowerCase().includes(q)
      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && r.is_active) ||
        (statusFilter === 'INACTIVE' && !r.is_active)
      return matchQ && matchStatus
    })
  }, [rows, searchTerm, statusFilter])

  return (
    <AppShell isMobile={isMobile}>
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
            subtitle="קבלנים וספקים חיצוניים — העברת תקלות ב-SMS מדף התקלות"
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
              טבלת אנשי המקצוע עדיין לא הופעלה ב-Supabase. הריצו את המיגרציה{' '}
              <code style={styles.code}>045_professionals.sql</code> ב-SQL Editor.
            </p>
          </Card>
        )}

        <PaidAddonGate addonKey={PAID_ADDON_KEYS.professionals}>
        {loading ? (
          <>
            <PageKpiSkeletonN columns={3} />
            <Card noPadding>
              <div style={{ padding: 20 }}>
                <PageListSkeleton rows={6} />
              </div>
            </Card>
          </>
        ) : (
          <>
            <div style={styles.kpiGrid}>
              <KpiCard label="סה״כ" value={stats.total} accent="primary" />
              <KpiCard label="פעילים" value={stats.active} accent="success" />
              <KpiCard label="לא פעילים" value={stats.inactive} />
            </div>

            <Card noPadding>
              <div style={{ ...styles.filters, flexDirection: isMobile ? 'column' : 'row' }}>
                <SearchInput
                  value={searchTerm}
                  onChange={setSearchTerm}
                  placeholder="חיפוש לפי שם, תחום, טלפון..."
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
                  description="הוסיפו קשרים חיצוניים לשליחת פרטי תקלות ב-SMS."
                  action={
                    <Button variant="primary" onClick={openCreate} disabled={tableMissing}>
                      הוספה
                    </Button>
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
                      {row.notes ? <div style={styles.notes}>{row.notes}</div> : null}
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
                    </div>
                  ))}
                </div>
              )}
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
        subtitle="פרטי קשר ל-SMS בעת העברת תקלה"
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
            className="app-input"
            value={form.phone}
            onChange={(e) => updateForm('phone', e.target.value)}
            style={styles.input}
          />
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
          <label style={styles.label}>הערות</label>
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
    </AppShell>
  )
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
  content: { padding: '24px 32px 48px', maxWidth: 1200, margin: '0 auto', width: '100%' },
  contentMobile: { padding: '16px 16px 80px', maxWidth: '100%', boxSizing: 'border-box' },
  kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 },
  filters: { display: 'flex', gap: 12, padding: '16px 20px', borderBottom: `1px solid ${theme.colors.border}` },
  list: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16, padding: 20 },
  card: {
    padding: 16,
    borderRadius: theme.radius.lg,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  name: { fontSize: 16, fontWeight: 600, color: theme.colors.textPrimary },
  sub: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  phone: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 8 },
  notes: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 12, lineHeight: 1.4 },
  actions: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  form: { display: 'flex', flexDirection: 'column', gap: 12 },
  label: { fontSize: 12, fontWeight: 600, color: theme.colors.textMuted },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    fontSize: 14,
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  checkRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, cursor: 'pointer' },
  migrationHint: { margin: 0, fontSize: 14, lineHeight: 1.5, color: theme.colors.textSecondary },
  code: { fontSize: 13, background: theme.colors.muted, padding: '2px 6px', borderRadius: 4 },
}
