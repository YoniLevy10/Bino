'use client'

/**
 * דף עובדים – ניהול צוות השירות שמטפל בתקלות.
 *
 * מציג: כרטיסי KPI (עובדים פעילים / סה"כ), טבלת עובדים עם שם, טלפון, תפקיד, סטטוס.
 *
 * פעולות:
 *  - "עובד חדש" → Drawer עם טופס → POST /api/create-worker
 *  - עריכת עובד → PATCH /api/update-worker
 *  - הסרה/ארכיב → soft-delete (deleted_at)
 *  - לחיצה על עובד → Drawer עם פרטים + תקלות שמשויכות אליו
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { resolveBamakorClientIdForBrowser } from '@/lib/bamakor-client'
import { withClientId } from '@/lib/supabase/with-client-id'
import { toast, asyncHandler } from '@/lib/error-handler'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { TM } from '@/lib/toast-messages'
import { validateRequired, validatePhoneNumber, validateEmail } from '@/lib/validators'
import {
  AppShell,
  MobileHeader,
  MobileMenu,
  PageHeader,
  KpiCard,
  Card,
  Button,
  StatusBadge,
  SearchInput,
  Select,
  Drawer,
  EmptyState,
  LoadingSpinner,
  theme
} from '../components/ui'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { PageKpiSkeletonN, PageListSkeleton } from '../components/page-skeleton'
import {
  collectWorkerPhones,
  formatWorkerPhonesDisplay,
  MAX_WORKER_EXTRA_PHONES,
  sanitizeExtraPhones,
  workerHasPhone,
} from '@/lib/worker-phones'

type WorkerRow = {
  id: string
  full_name: string
  phone: string
  extra_phones?: string[] | null
  email: string | null
  role: string | null
  is_active: boolean
  created_at: string
  client_id: string
  access_token?: string | null
}

type TicketRow = {
  id: string
  ticket_number: number
  status: string
  priority?: string | null
  project_code?: string
  project_name?: string
}

type RawTicketWithProjects = {
  id: string
  ticket_number: number
  status: string
  priority?: string | null
  projects?: { project_code?: string; name?: string } | { project_code?: string; name?: string }[]
}

type WorkerForm = {
  full_name: string
  phone: string
  extra_phones: string[]
  email: string
  role: string
  is_active: boolean
}

const emptyForm: WorkerForm = {
  full_name: '',
  phone: '',
  extra_phones: [],
  email: '',
  role: '',
  is_active: true,
}

export default function WorkersPage() {
  const [workers, setWorkers] = useState<WorkerRow[]>([])
  const [clientId, setClientId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sendingPortalLinkId, setSendingPortalLinkId] = useState<string | null>(null)
  const [testingSmsWorkerId, setTestingSmsWorkerId] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingWorker, setEditingWorker] = useState<WorkerRow | null>(null)
  const [form, setForm] = useState<WorkerForm>(emptyForm)
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false)
  const [selectedWorker, setSelectedWorker] = useState<WorkerRow | null>(null)
  const [workerTickets, setWorkerTickets] = useState<TicketRow[]>([])
  const [loadingWorkerTickets, setLoadingWorkerTickets] = useState(false)

  async function loadClientId() {
    const id = await resolveBamakorClientIdForBrowser()
    setClientId(id)
    return id
  }

  async function loadWorkers(nextClientId?: string) {
    const activeClientId = nextClientId || clientId
    if (!activeClientId) return

    const { data, error } = await supabase
      .from('workers')
      .select('*')
      .eq('client_id', activeClientId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })

    if (error) throw error
    setWorkers((data as WorkerRow[]) || [])
  }

  useEffect(() => {
    const initialize = async () => {
      setLoading(true)
      await asyncHandler(
        async () => {
          const fetchedClientId = await loadClientId()
          await loadWorkers(fetchedClientId)
          return true
        },
        { context: 'טעינת עובדים', showErrorToast: true }
      )
      setLoading(false)
    }
    void initialize()
  }, [clientId])

  function openCreateDrawer() {
    setEditingWorker(null)
    setForm(emptyForm)
    setDrawerOpen(true)
  }

  function openEditDrawer(worker: WorkerRow) {
    setEditingWorker(worker)
    setForm({
      full_name: worker.full_name || '',
      phone: worker.phone || '',
      extra_phones: [...(worker.extra_phones ?? [])],
      email: worker.email || '',
      role: worker.role || '',
      is_active: worker.is_active,
    })
    setDrawerOpen(true)
  }

  function closeDrawer() {
    if (saving) return
    setDrawerOpen(false)
    setEditingWorker(null)
    setForm(emptyForm)
  }

  async function openDetailDrawer(worker: WorkerRow) {
    setSelectedWorker(worker)
    setDetailDrawerOpen(true)
    await fetchWorkerTickets(worker.id)
  }

  function closeDetailDrawer() {
    setDetailDrawerOpen(false)
    setSelectedWorker(null)
    setWorkerTickets([])
  }

  async function fetchWorkerTickets(workerId: string) {
    setLoadingWorkerTickets(true)
    await asyncHandler(
      async () => {
        const scoped = clientId || (await resolveBamakorClientIdForBrowser())
        const { data, error } = await withClientId(
          supabase.from('tickets').select(`
            id, ticket_number, status, priority,
            projects (project_code, name)
          `),
          scoped
        )
          .eq('assigned_worker_id', workerId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(10)

        if (error) throw error

        const mapped = (data || []).map((ticket: RawTicketWithProjects) => {
          let projectCode = 'N/A'
          let projectName = 'Unknown'

          if (ticket.projects) {
            if (Array.isArray(ticket.projects)) {
              projectCode = ticket.projects[0]?.project_code || 'N/A'
              projectName = ticket.projects[0]?.name || 'Unknown'
            } else {
              projectCode = ticket.projects.project_code || 'N/A'
              projectName = ticket.projects.name || 'Unknown'
            }
          }

          return {
            id: ticket.id,
            ticket_number: ticket.ticket_number,
            status: ticket.status,
            priority: ticket.priority,
            project_code: projectCode,
            project_name: projectName,
          }
        })

        setWorkerTickets(mapped)
        return true
      },
      { context: 'Failed to load worker tickets', showErrorToast: false }
    )
    setLoadingWorkerTickets(false)
  }

  function updateForm<K extends keyof WorkerForm>(key: K, value: WorkerForm[K]) {
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

  function validateForm() {
    const nameError = validateRequired(form.full_name, 'שם')
    if (nameError) return 'נא למלא שם מלא'
    const phoneError = validatePhoneNumber(form.phone, 'טלפון')
    if (phoneError) return 'נא להזין מספר טלפון ראשי תקין (לפחות 10 ספרות)'
    for (let i = 0; i < form.extra_phones.length; i++) {
      const extra = form.extra_phones[i]?.trim()
      if (!extra) continue
      const extraError = validatePhoneNumber(extra, `טלפון נוסף ${i + 1}`)
      if (extraError) return 'מספר טלפון נוסף לא תקין (לפחות 10 ספרות)'
    }
    const extraSanitized = sanitizeExtraPhones(form.phone, form.extra_phones)
    if (!extraSanitized.ok) return extraSanitized.error
    if (!editingWorker && !form.email.trim()) return 'נדרש אימייל לעובד חדש'
    if (form.email) {
      const emailError = validateEmail(form.email, 'אימייל')
      if (emailError) return 'כתובת אימייל לא תקינה'
    }
    if (!clientId) return 'לא נמצא מזהה לקוח — התחברו מחדש'
    return ''
  }

  async function saveWorker() {
    const validationError = validateForm()
    if (validationError) {
      toast.error(validationError)
      return
    }

    setSaving(true)
    await asyncHandler(
      async () => {
        const extraSanitized = sanitizeExtraPhones(form.phone, form.extra_phones)
        if (!extraSanitized.ok) throw new Error(extraSanitized.error)

        const payload = {
          full_name: form.full_name.trim(),
          phone: form.phone.trim(),
          extra_phones: extraSanitized.phones,
          email: form.email.trim() || null,
          role: form.role.trim() || null,
          is_active: form.is_active,
          client_id: clientId,
        }

        if (editingWorker) {
          const res = await fetchWithTimeout('/api/update-worker', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              worker_id: editingWorker.id,
              full_name: payload.full_name,
              phone: payload.phone,
              extra_phones: payload.extra_phones,
              email: payload.email,
              role: payload.role,
              is_active: payload.is_active,
            }),
          })
          const json = (await res?.json().catch(() => ({}))) as { error?: string }
          if (!res?.ok) throw new Error(json.error || TM.genericSaveError)
          toast.success(TM.workerUpdated)
        } else {
          const res = await fetchWithTimeout('/api/create-worker', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              full_name: payload.full_name,
              phone: payload.phone,
              extra_phones: payload.extra_phones,
              email: payload.email,
              role: payload.role,
              is_active: payload.is_active,
            }),
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error((json as { error?: string }).error || 'יצירת עובד נכשלה')
          toast.success('העובד נוצר')
        }

        await loadWorkers()
        closeDrawer()
        return true
      },
      { context: 'שמירת עובד', showErrorToast: true }
    )
    setSaving(false)
  }

  async function toggleWorkerStatus(worker: WorkerRow) {
    await asyncHandler(
      async () => {
        const res = await fetchWithTimeout('/api/update-worker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ worker_id: worker.id, is_active: !worker.is_active }),
        })
        const json = (await res?.json().catch(() => ({}))) as { error?: string }
        if (!res?.ok) throw new Error(json.error || TM.genericSaveError)
        toast.success(worker.is_active ? TM.workerDeactivated : TM.workerActivated)
        await loadWorkers()
        return true
      },
      { context: 'עדכון סטטוס עובד', showErrorToast: true }
    )
  }

  async function deleteWorker(worker: WorkerRow) {
    const confirmed = window.confirm(`Delete ${worker.full_name}? This action cannot be undone.`)
    if (!confirmed) return

    await asyncHandler(
      async () => {
        const res = await fetchWithTimeout('/api/update-worker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ worker_id: worker.id, soft_delete: true }),
        })
        const json = (await res?.json().catch(() => ({}))) as { error?: string }
        if (!res?.ok) throw new Error(json.error || TM.genericSaveError)
        toast.success(TM.workerDeleted)
        await loadWorkers()
        if (editingWorker?.id === worker.id) closeDrawer()
        return true
      },
      { context: 'מחיקת עובד', showErrorToast: true }
    )
  }

  const stats = useMemo(() => {
    const total = workers.length
    const active = workers.filter((w) => w.is_active).length
    const inactive = workers.filter((w) => !w.is_active).length
    return { total, active, inactive }
  }, [workers])

  const filteredWorkers = useMemo(() => {
    return workers.filter((worker) => {
      const q = searchTerm.trim().toLowerCase()
      const matchesSearch = !q ||
        worker.full_name.toLowerCase().includes(q) ||
        worker.phone.toLowerCase().includes(q) ||
        (worker.extra_phones ?? []).some((p) => p.toLowerCase().includes(q)) ||
        (worker.email || '').toLowerCase().includes(q) ||
        (worker.role || '').toLowerCase().includes(q)

      const matchesStatus = statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && worker.is_active) ||
        (statusFilter === 'INACTIVE' && !worker.is_active)

      return matchesSearch && matchesStatus
    })
  }, [workers, searchTerm, statusFilter])

  function getInitials(name: string) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  function copyWorkerFieldLink(worker: WorkerRow, e?: React.MouseEvent) {
    e?.stopPropagation()
    const token = worker.access_token
    if (!token) {
      toast.error('אין טוקן לעובד')
      return
    }
    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/worker?token=${encodeURIComponent(token)}`
    void navigator.clipboard.writeText(url).then(
      () => toast.success('הקישור הועתק'),
      () => toast.error('העתקה נכשלה')
    )
  }

  async function sendWorkerTestSms(worker: WorkerRow, e?: React.MouseEvent) {
    e?.stopPropagation()
    if (!workerHasPhone(worker)) {
      toast.error('לעובד אין מספר טלפון')
      return
    }
    setTestingSmsWorkerId(worker.id)
    try {
      const res = await fetchWithTimeout('/api/workers/test-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: worker.id }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        sent?: number
        total?: number
        partial?: boolean
      }
      if (!res.ok) {
        toast.error(json.error || 'שליחת SMS נכשלה')
        return
      }
      if (json.partial) {
        toast.success(`נשלח ל-${json.sent}/${json.total} מספרים`)
      } else {
        toast.success(`הודעת בדיקה נשלחה ל-${json.total || collectWorkerPhones(worker).length} מספרים`)
      }
    } catch {
      toast.error('שגיאת חיבור — נסו שוב')
    } finally {
      setTestingSmsWorkerId(null)
    }
  }

  async function sendWorkerPortalLink(worker: WorkerRow, e?: React.MouseEvent) {
    e?.stopPropagation()
    if (!workerHasPhone(worker)) {
      toast.error('לעובד אין מספר טלפון')
      return
    }
    setSendingPortalLinkId(worker.id)
    try {
      const res = await fetchWithTimeout('/api/workers/send-portal-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_id: worker.id }),
      })
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        sent?: number
        total?: number
        partial?: boolean
      }
      if (!res.ok) {
        toast.error(json.error || 'שליחת SMS נכשלה')
        return
      }
      if (json.partial) {
        toast.success(`קישור נשלח ל-${json.sent}/${json.total} מספרים`)
      } else {
        toast.success(`קישור נשלח ל-${json.total || collectWorkerPhones(worker).length} מספרים`)
      }
    } catch {
      toast.error('שגיאת חיבור — נסו שוב')
    } finally {
      setSendingPortalLinkId(null)
    }
  }

  return (
    <AppShell isMobile={isMobile}>
      {isMobile && (
        <MobileHeader
          title="עובדים"
          subtitle={`${filteredWorkers.length} עובדים`}
          onMenuClick={() => setMenuOpen(true)}
        />
      )}

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div
        style={{
          ...styles.content,
          ...(isMobile
            ? { padding: '16px 16px 8px', maxWidth: '100%', boxSizing: 'border-box', minWidth: 0 }
            : {}),
        }}
      >
        {!isMobile && (
          <PageHeader
            title="עובדים"
            subtitle="ניהול צוות אחזקה"
            actions={
              <Button variant="primary" onClick={openCreateDrawer}>
                עובד חדש
              </Button>
            }
          />
        )}

        {loading ? (
          <>
            <PageKpiSkeletonN columns={3} />
            <Card noPadding>
              <div style={{ padding: '20px 16px' }}>
                <PageListSkeleton rows={8} />
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
                  <LoadingSpinner />
                </div>
              </div>
            </Card>
          </>
        ) : (
          <>
        {/* KPI Cards */}
        <div style={{
          ...styles.kpiGrid,
          gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(3, 1fr)',
        }}>
          <KpiCard label="סה״כ עובדים" value={stats.total} accent="primary" />
          <KpiCard label="פעילים" value={stats.active} accent="success" />
          <KpiCard label="לא פעילים" value={stats.inactive} />
        </div>

        {/* Filters + Grid */}
        <Card noPadding>
          <div style={{
            ...styles.filtersRow,
            flexDirection: isMobile ? 'column' : 'row',
          }}>
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="חיפוש עובדים..."
              style={{ flex: 1, maxWidth: isMobile ? '100%' : '320px' }}
            />
            <Select
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
              options={[
                { label: 'כל הסטטוסים', value: 'ALL' },
                { label: 'פעיל', value: 'ACTIVE' },
                { label: 'לא פעיל', value: 'INACTIVE' },
              ]}
              style={{ minWidth: '140px' }}
            />
          </div>

          {filteredWorkers.length === 0 ? (
            <EmptyState
              title="לא נמצאו עובדים"
              description="נסו לשנות מסננים או להוסיף עובד חדש."
              action={
                <Button variant="primary" onClick={openCreateDrawer}>
                  הוספת עובד
                </Button>
              }
            />
          ) : (
            <div style={{
              ...styles.workerGrid,
              gridTemplateColumns: isMobile ? '1fr' : undefined,
            }}>
              {filteredWorkers.map((worker) => (
                <div
                  key={worker.id}
                  onClick={() => openDetailDrawer(worker)}
                  style={styles.workerCard}
                  data-ui="card"
                >
                  <div style={styles.workerHeader}>
                    <div style={styles.avatar}>
                      {getInitials(worker.full_name)}
                    </div>
                    <div style={styles.workerInfo}>
                      <div style={styles.workerName}>{worker.full_name}</div>
                      <div style={styles.workerRole}>{worker.role || 'ללא תפקיד'}</div>
                    </div>
                    <span style={workerStatusBadge(worker.is_active)}>
                      {worker.is_active ? 'פעיל' : 'לא פעיל'}
                    </span>
                  </div>

                  <div style={styles.workerMeta}>
                    <div style={styles.metaItem}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                      <span style={styles.metaText}>{formatWorkerPhonesDisplay(worker)}</span>
                    </div>
                    {worker.email && (
                      <div style={styles.metaItem}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect width="20" height="16" x="2" y="4" rx="2" />
                          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                        </svg>
                        <span style={styles.metaText}>{worker.email}</span>
                      </div>
                    )}
                  </div>

                  <div style={styles.workerActions} onClick={(e) => e.stopPropagation()}>
                    <Button variant="secondary" size="sm" style={styles.actionBtn} onClick={() => openEditDrawer(worker)}>
                      עריכה
                    </Button>
                    <Button variant="secondary" size="sm" style={styles.actionBtn} onClick={(e) => copyWorkerFieldLink(worker, e)}>
                      העתק קישור
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      style={styles.actionBtn}
                      loading={sendingPortalLinkId === worker.id}
                      onClick={(e) => void sendWorkerPortalLink(worker, e)}
                    >
                      שלח קישור ב-SMS
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      style={styles.actionBtn}
                      loading={testingSmsWorkerId === worker.id}
                      onClick={(e) => void sendWorkerTestSms(worker, e)}
                    >
                      ניסיון SMS
                    </Button>
                    <Button variant="secondary" size="sm" style={styles.actionBtn} onClick={() => toggleWorkerStatus(worker)}>
                      {worker.is_active ? 'השבתה' : 'הפעלה'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
          </>
        )}
      </div>

      {/* Create/Edit Drawer */}
      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editingWorker ? 'עריכת עובד' : 'עובד חדש'}
        subtitle={editingWorker ? 'עדכון פרטי עובד' : 'הוספת חבר צוות'}
        isMobile={isMobile}
      >
        <div style={styles.drawerContent}>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>שם מלא *</label>
            <input
              value={form.full_name}
              onChange={(e) => updateForm('full_name', e.target.value)}
              placeholder="שם מלא"
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>טלפון ראשי *</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => updateForm('phone', e.target.value)}
              placeholder="מספר אישי / ראשי"
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <div style={styles.extraPhonesHeader}>
              <label style={styles.formLabel}>טלפונים נוספים (SMS)</label>
              {form.extra_phones.length < MAX_WORKER_EXTRA_PHONES ? (
                <Button variant="ghost" size="sm" type="button" onClick={addExtraPhoneField}>
                  + הוסף מספר
                </Button>
              ) : null}
            </div>
            <p style={styles.formHint}>למשל טלפון עבודה — כל המספרים יקבלו SMS בשיבוץ ובקישור לאזור האישי</p>
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
                      value={extraPhone}
                      onChange={(e) => updateExtraPhone(index, e.target.value)}
                      placeholder={`טלפון נוסף ${index + 1}`}
                      style={{ ...styles.input, flex: 1 }}
                    />
                    <Button variant="ghost" size="sm" type="button" onClick={() => removeExtraPhone(index)}>
                      הסר
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>{editingWorker ? 'אימייל' : 'אימייל *'}</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => updateForm('email', e.target.value)}
              placeholder="כתובת אימייל"
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>תפקיד</label>
            <input
              value={form.role}
              onChange={(e) => updateForm('role', e.target.value)}
              placeholder="למשל: טכנאי, אינסטלטור"
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => updateForm('is_active', e.target.checked)}
                style={styles.checkbox}
              />
              <span>פעיל</span>
            </label>
          </div>

          <div style={styles.drawerActions}>
            <Button variant="secondary" onClick={closeDrawer}>
              ביטול
            </Button>
            <Button variant="primary" onClick={saveWorker} loading={saving}>
              {editingWorker ? 'עדכון' : 'יצירה'}
            </Button>
          </div>

          {editingWorker && (
            <div style={styles.dangerZone}>
              <Button
                variant="danger"
                onClick={() => deleteWorker(editingWorker)}
                style={{ width: '100%' }}
              >
                מחיקת עובד
              </Button>
            </div>
          )}
        </div>
      </Drawer>

      {/* Detail Drawer */}
      <Drawer
        open={detailDrawerOpen}
        onClose={closeDetailDrawer}
        title={selectedWorker?.full_name || ''}
        subtitle={selectedWorker?.role || 'חבר צוות'}
        isMobile={isMobile}
      >
        {selectedWorker && (
          <div style={styles.drawerContent}>
            <div style={styles.detailSection}>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>סטטוס</span>
                <span style={workerStatusBadge(selectedWorker.is_active)}>
                  {selectedWorker.is_active ? 'פעיל' : 'לא פעיל'}
                </span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>טלפונים</span>
                <span style={styles.detailValue}>{formatWorkerPhonesDisplay(selectedWorker)}</span>
              </div>
              <div style={styles.detailRow}>
                <span style={styles.detailLabel}>אימייל</span>
                <span style={styles.detailValue}>{selectedWorker.email || '-'}</span>
              </div>
            </div>

            <div style={styles.ticketsSection}>
              <div style={styles.ticketsSectionHeader}>
                <h4 style={styles.ticketsSectionTitle}>תקלות משויכות</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.location.href = `/tickets?worker=${encodeURIComponent(selectedWorker.id)}`}
                >
                  הצג הכל
                </Button>
              </div>

              {loadingWorkerTickets ? (
                <div style={styles.loadingSmall}>
                  <LoadingSpinner size="sm" />
                </div>
              ) : workerTickets.length === 0 ? (
                <p style={styles.emptyText}>אין תקלות משויכות</p>
              ) : (
                <div style={styles.ticketList}>
                  {workerTickets.slice(0, 5).map((ticket) => (
                    <div key={ticket.id} style={styles.ticketItem}>
                      <div>
                        <span style={styles.ticketNumber}>#{ticket.ticket_number}</span>
                        <span style={styles.ticketProject}>{ticket.project_name}</span>
                      </div>
                      <StatusBadge status={ticket.status} size="sm" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={styles.drawerActionsGrid}>
              <Button variant="secondary" style={styles.actionBtn} onClick={() => copyWorkerFieldLink(selectedWorker)}>
                העתק קישור
              </Button>
              <Button
                variant="secondary"
                style={styles.actionBtn}
                loading={sendingPortalLinkId === selectedWorker.id}
                onClick={() => void sendWorkerPortalLink(selectedWorker)}
              >
                שלח קישור ב-SMS
              </Button>
              <Button
                variant="secondary"
                style={styles.actionBtn}
                loading={testingSmsWorkerId === selectedWorker.id}
                onClick={() => void sendWorkerTestSms(selectedWorker)}
              >
                ניסיון SMS
              </Button>
              <Button variant="secondary" style={styles.actionBtn} onClick={() => openEditDrawer(selectedWorker)}>
                עריכת עובד
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </AppShell>
  )
}

const workerStatusBadge = (active: boolean): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 10px',
  borderRadius: theme.radius.full,
  fontSize: '11px',
  fontWeight: 600,
  flexShrink: 0,
  background: active ? theme.colors.successMuted : theme.colors.muted,
  color: active ? theme.colors.success : theme.colors.textMuted,
})

const styles: Record<string, CSSProperties> = {
  content: {
    padding: '32px 40px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  kpiGrid: {
    display: 'grid',
    gap: '16px',
    marginBottom: '24px',
  },
  filtersRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '20px 24px',
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '64px 0',
  },
  workerGrid: {
    display: 'grid',
    gap: '20px',
    padding: '24px',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
  },
  workerCard: {
    background: theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.lg,
    padding: '20px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  workerHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    marginBottom: '16px',
  },
  avatar: {
    width: '48px',
    height: '48px',
    borderRadius: theme.radius.full,
    background: theme.colors.primaryMuted,
    color: theme.colors.primary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    fontWeight: 600,
    flexShrink: 0,
  },
  workerInfo: {
    flex: 1,
    minWidth: 0,
  },
  workerName: {
    fontSize: '16px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  workerRole: {
    fontSize: '13px',
    color: theme.colors.textMuted,
    marginTop: '2px',
  },
  workerMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginBottom: '20px',
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  metaText: {
    fontSize: '14px',
    color: theme.colors.textSecondary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  workerActions: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '8px',
    marginTop: 'auto',
  },
  actionBtn: {
    width: '100%',
    justifyContent: 'center',
  },
  drawerActionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '10px',
    paddingTop: '16px',
    borderTop: `1px solid ${theme.colors.border}`,
    marginTop: '8px',
  },
  drawerContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  formLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
  },
  formHint: {
    margin: 0,
    fontSize: '12px',
    color: theme.colors.textMuted,
    lineHeight: 1.4,
  },
  extraPhonesHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  extraPhoneList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  extraPhoneRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  input: {
    padding: '12px 14px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    fontSize: '15px',
    color: theme.colors.textPrimary,
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '15px',
    color: theme.colors.textPrimary,
    cursor: 'pointer',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    accentColor: theme.colors.primary,
  },
  drawerActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    paddingTop: '16px',
    borderTop: `1px solid ${theme.colors.border}`,
    marginTop: '8px',
  },
  dangerZone: {
    paddingTop: '20px',
    borderTop: `1px solid ${theme.colors.border}`,
    marginTop: '12px',
  },
  detailSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    padding: '16px',
    background: theme.colors.muted,
    borderRadius: theme.radius.md,
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: '13px',
    color: theme.colors.textMuted,
  },
  detailValue: {
    fontSize: '14px',
    color: theme.colors.textPrimary,
  },
  ticketsSection: {
    marginTop: '8px',
  },
  ticketsSectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  ticketsSectionTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
    margin: 0,
  },
  loadingSmall: {
    display: 'flex',
    justifyContent: 'center',
    padding: '24px 0',
  },
  emptyText: {
    textAlign: 'center',
    color: theme.colors.textMuted,
    fontSize: '14px',
    padding: '24px 0',
  },
  ticketList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  ticketItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    background: theme.colors.muted,
    borderRadius: theme.radius.sm,
  },
  ticketNumber: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.colors.textPrimary,
  },
  ticketProject: {
    fontSize: '12px',
    color: theme.colors.textMuted,
    marginLeft: '8px',
  },
}
