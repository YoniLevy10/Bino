'use client'

/**
 * דף נוכחות משרד — QR בכניסה, ניהול עובדות משרד, רישומי שעות וגדר גיאוגרפית.
 *
 * מציג: KPI (במשמרת / שעות בטווח / עובדות פעילות), QR להדפסה, רשימת עובדות, משמרות פתוחות, טבלת רישומים.
 *
 * API:
 *  - GET /api/attendance/manage?from=&to=
 *  - POST /api/attendance/office-staff
 *  - PATCH /api/attendance/entries/[id]
 *  - PATCH /api/attendance/geofence
 *  - POST /api/attendance/regenerate-station
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import { toast, asyncHandler } from '@/lib/error-handler'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { TM } from '@/lib/toast-messages'
import { formatOfficeClockTime } from '@/lib/office-attendance'
import { mapsLink } from '@/lib/office-geo'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import {
  AppShell,
  MobileHeader,
  MobileMenu,
  PageHeader,
  KpiCard,
  Card,
  Button,
  Drawer,
  EmptyState,
  SearchInput,
  Select,
  StatusBadge,
  LoadingSpinner,
  theme,
} from '../components/ui'
import { PageKpiSkeletonN, PageListSkeleton } from '../components/page-skeleton'

type Period = 'today' | 'week' | 'month' | 'custom'

type OfficeStaff = {
  id: string
  full_name: string
  hourly_rate: number | null
  is_active: boolean
}

type TimeEntry = {
  id: string
  staff_id: string
  staff_name: string
  clock_in_at: string
  clock_out_at: string | null
  clock_in_lat: number | null
  clock_in_lng: number | null
  clock_out_lat: number | null
  clock_out_lng: number | null
  hours_label: string
  cost: number | null
  geofence_warning: boolean
}

type OpenShift = {
  id: string
  staff_id: string
  staff_name: string
  clock_in_at: string
  stale: boolean
}

type Geofence = {
  lat: number | null
  lng: number | null
  radius_m: number
}

type ManagePayload = {
  scan_url: string
  staff: OfficeStaff[]
  entries: TimeEntry[]
  open_shifts: OpenShift[]
  geofence: Geofence
  stats: {
    open_count: number
    active_staff: number
    total_hours: number
  }
  range: { from: string; to: string }
}

type StaffForm = {
  full_name: string
  hourly_rate: string
  is_active: boolean
}

type EntryForm = {
  clock_in_at: string
  clock_out_at: string
}

const emptyStaffForm: StaffForm = { full_name: '', hourly_rate: '', is_active: true }
const emptyEntryForm: EntryForm = { clock_in_at: '', clock_out_at: '' }

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function clampDateRange(range: { from: Date; toExclusive: Date }) {
  const { from, toExclusive } = range
  if (!(from instanceof Date) || isNaN(from.getTime())) return null
  if (!(toExclusive instanceof Date) || isNaN(toExclusive.getTime())) return null
  if (toExclusive <= from) return null
  return { from, toExclusive }
}

function resolveDateRange(
  period: Period,
  customFrom: string,
  customTo: string
): { label: string; from: Date; toExclusive: Date } | null {
  const now = new Date()
  const today = startOfDay(now)

  if (period === 'today') {
    const toExclusive = new Date(today.getTime() + 24 * 60 * 60 * 1000)
    return { label: 'היום', from: today, toExclusive }
  }

  if (period === 'week') {
    const start = new Date(today)
    start.setDate(today.getDate() - today.getDay())
    return { label: 'השבוע', from: start, toExclusive: new Date(now.getTime() + 1) }
  }

  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    return { label: 'החודש', from: start, toExclusive: new Date(now.getTime() + 1) }
  }

  if (!customFrom || !customTo) return null
  const from = startOfDay(new Date(customFrom))
  const toInclusive = startOfDay(new Date(customTo))
  const toExclusive = new Date(toInclusive.getTime() + 24 * 60 * 60 * 1000)
  const valid = clampDateRange({ from, toExclusive })
  if (!valid) return null
  return {
    label: `מותאם (${from.toLocaleDateString('he-IL')}–${toInclusive.toLocaleDateString('he-IL')})`,
    from: valid.from,
    toExclusive: valid.toExclusive,
  }
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function isoFromDatetimeLocal(local: string): string | null {
  if (!local.trim()) return null
  const d = new Date(local)
  if (isNaN(d.getTime())) return null
  return d.toISOString()
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function staffStatusBadge(active: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 10px',
    borderRadius: theme.radius.full,
    fontSize: '11px',
    fontWeight: 600,
    flexShrink: 0,
    background: active ? theme.colors.successMuted : theme.colors.muted,
    color: active ? theme.colors.success : theme.colors.textMuted,
  }
}

export default function AttendancePage() {
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ManagePayload | null>(null)
  const [period, setPeriod] = useState<Period>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [staffSearch, setStaffSearch] = useState('')
  const [staffStatusFilter, setStaffStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')

  const [staffDrawerOpen, setStaffDrawerOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState<OfficeStaff | null>(null)
  const [staffForm, setStaffForm] = useState<StaffForm>(emptyStaffForm)
  const [savingStaff, setSavingStaff] = useState(false)

  const [entryDrawerOpen, setEntryDrawerOpen] = useState(false)
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [entryForm, setEntryForm] = useState<EntryForm>(emptyEntryForm)
  const [savingEntry, setSavingEntry] = useState(false)

  const [regeneratingQr, setRegeneratingQr] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [geofenceOpen, setGeofenceOpen] = useState(false)
  const [geofenceForm, setGeofenceForm] = useState({ lat: '', lng: '', radius: '150' })
  const [savingGeofence, setSavingGeofence] = useState(false)

  const qrRef = useRef<HTMLDivElement>(null)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const activeRange = useMemo(
    () => resolveDateRange(period, customFrom, customTo),
    [period, customFrom, customTo]
  )

  const manageQuery = useMemo(() => {
    if (!activeRange) return null
    const params = new URLSearchParams({
      from: activeRange.from.toISOString(),
      to: activeRange.toExclusive.toISOString(),
    })
    return params.toString()
  }, [activeRange])

  const load = useCallback(async () => {
    if (!manageQuery) return
    const res = await fetchWithTimeout(`/api/attendance/manage?${manageQuery}`, { method: 'GET' })
    const body = (await res.json()) as ManagePayload & { error?: string }
    if (!res.ok) throw new Error(body.error || TM.genericLoadError)
    setData(body)
    const g = body.geofence
    setGeofenceForm({
      lat: g.lat != null ? String(g.lat) : '',
      lng: g.lng != null ? String(g.lng) : '',
      radius: String(g.radius_m ?? 150),
    })
  }, [manageQuery])

  useEffect(() => {
    if (!manageQuery) {
      setLoading(false)
      return
    }
    void asyncHandler(
      async () => {
        setLoading(true)
        await load()
        return true
      },
      { context: 'טעינת נוכחות משרד', showErrorToast: true }
    ).finally(() => setLoading(false))
  }, [load, manageQuery])

  const filteredStaff = useMemo(() => {
    const list = data?.staff || []
    const q = staffSearch.trim().toLowerCase()
    return list.filter((s) => {
      const matchesSearch = !q || s.full_name.toLowerCase().includes(q)
      const matchesStatus =
        staffStatusFilter === 'ALL' ||
        (staffStatusFilter === 'ACTIVE' && s.is_active) ||
        (staffStatusFilter === 'INACTIVE' && !s.is_active)
      return matchesSearch && matchesStatus
    })
  }, [data?.staff, staffSearch, staffStatusFilter])

  function openCreateStaff() {
    setEditingStaff(null)
    setStaffForm(emptyStaffForm)
    setStaffDrawerOpen(true)
  }

  function openEditStaff(s: OfficeStaff) {
    setEditingStaff(s)
    setStaffForm({
      full_name: s.full_name,
      hourly_rate: s.hourly_rate != null ? String(s.hourly_rate) : '',
      is_active: s.is_active,
    })
    setStaffDrawerOpen(true)
  }

  function closeStaffDrawer() {
    if (savingStaff) return
    setStaffDrawerOpen(false)
    setEditingStaff(null)
    setStaffForm(emptyStaffForm)
  }

  async function saveStaff() {
    const name = staffForm.full_name.trim()
    if (!name) {
      toast.error('נא להזין שם')
      return
    }
    const hourly =
      staffForm.hourly_rate.trim() === ''
        ? null
        : Number.parseFloat(staffForm.hourly_rate.replace(',', '.'))
    if (staffForm.hourly_rate.trim() !== '' && (hourly == null || Number.isNaN(hourly) || hourly < 0)) {
      toast.error('תעריף שעתי לא תקין')
      return
    }
    setSavingStaff(true)
    try {
      const res = await fetchWithTimeout('/api/attendance/office-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingStaff?.id,
          full_name: name,
          hourly_rate: hourly,
          is_active: staffForm.is_active,
        }),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || TM.genericSaveError)
      toast.success(editingStaff ? 'העובדת עודכנה בהצלחה ✓' : 'העובדת נוספה בהצלחה ✓')
      closeStaffDrawer()
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : TM.genericSaveError)
    } finally {
      setSavingStaff(false)
    }
  }

  function openEditEntry(entry: TimeEntry) {
    setEditingEntry(entry)
    setEntryForm({
      clock_in_at: toDatetimeLocalValue(entry.clock_in_at),
      clock_out_at: entry.clock_out_at ? toDatetimeLocalValue(entry.clock_out_at) : '',
    })
    setEntryDrawerOpen(true)
  }

  function closeEntryDrawer() {
    if (savingEntry) return
    setEntryDrawerOpen(false)
    setEditingEntry(null)
    setEntryForm(emptyEntryForm)
  }

  async function saveEntry() {
    if (!editingEntry) return
    const clockIn = isoFromDatetimeLocal(entryForm.clock_in_at)
    if (!clockIn) {
      toast.error('שעת כניסה לא תקינה')
      return
    }
    const clockOutRaw = entryForm.clock_out_at.trim()
    const clockOut = clockOutRaw ? isoFromDatetimeLocal(clockOutRaw) : null
    if (clockOutRaw && !clockOut) {
      toast.error('שעת יציאה לא תקינה')
      return
    }
    setSavingEntry(true)
    try {
      const res = await fetchWithTimeout(`/api/attendance/entries/${editingEntry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clock_in_at: clockIn,
          clock_out_at: clockOutRaw ? clockOut : null,
        }),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || TM.genericSaveError)
      toast.success('הרישום עודכן בהצלחה ✓')
      closeEntryDrawer()
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : TM.genericSaveError)
    } finally {
      setSavingEntry(false)
    }
  }

  async function regenerateQr() {
    if (!window.confirm('לרענן את קוד ה-QR? הקוד הישן יפסיק לעבוד.')) return
    setRegeneratingQr(true)
    try {
      const res = await fetchWithTimeout('/api/attendance/regenerate-station', { method: 'POST' })
      const body = (await res.json()) as { scan_url?: string; error?: string }
      if (!res.ok) throw new Error(body.error || TM.genericSaveError)
      if (body.scan_url) {
        setData((prev) => (prev ? { ...prev, scan_url: body.scan_url! } : prev))
      }
      toast.success('קוד QR חודש בהצלחה ✓')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : TM.genericSaveError)
    } finally {
      setRegeneratingQr(false)
    }
  }

  function downloadQrPng() {
    const canvas = qrRef.current?.querySelector('canvas')
    if (!canvas || !data?.scan_url) return
    const link = document.createElement('a')
    link.href = canvas.toDataURL('image/png')
    link.download = 'office-attendance-qr.png'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  async function copyScanLink() {
    if (!data?.scan_url) return
    try {
      await navigator.clipboard.writeText(data.scan_url)
      toast.success('הקישור הועתק ✓')
    } catch {
      toast.error('ההעתקה נכשלה')
    }
  }

  function printQr() {
    window.print()
  }

  async function saveGeofence() {
    const latStr = geofenceForm.lat.trim()
    const lngStr = geofenceForm.lng.trim()
    const lat = latStr === '' ? null : Number.parseFloat(latStr)
    const lng = lngStr === '' ? null : Number.parseFloat(lngStr)
    const radius = Number.parseInt(geofenceForm.radius, 10)
    if (latStr !== '' && (lat == null || Number.isNaN(lat))) {
      toast.error('קו רוחב לא תקין')
      return
    }
    if (lngStr !== '' && (lng == null || Number.isNaN(lng))) {
      toast.error('קו אורך לא תקין')
      return
    }
    if (Number.isNaN(radius) || radius < 10) {
      toast.error('רדיוס לא תקין (מינימום 10 מ׳)')
      return
    }
    setSavingGeofence(true)
    try {
      const res = await fetchWithTimeout('/api/attendance/geofence', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          office_geofence_lat: lat,
          office_geofence_lng: lng,
          office_geofence_radius_m: radius,
        }),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || TM.genericSaveError)
      toast.success(TM.settingsSaved)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : TM.genericSaveError)
    } finally {
      setSavingGeofence(false)
    }
  }

  async function exportExcel() {
    if (!data?.entries.length) {
      toast.error('אין רישומים לייצוא בטווח הנבחר')
      return
    }
    setExporting(true)
    try {
      const { XLSXStyle: XLSX, applyHeaderStyle, applyDataStyles } = await import('@/lib/excel-style')
      const rangeLabel = activeRange?.label || 'טווח'
      const rows = data.entries.map((e) => ({
        עובדת: e.staff_name,
        כניסה: formatOfficeClockTime(e.clock_in_at),
        יציאה: e.clock_out_at ? formatOfficeClockTime(e.clock_out_at) : '',
        שעות: e.hours_label || (e.clock_out_at ? '—' : 'במשמרת'),
        עלות: e.cost != null ? e.cost : '',
        אזהרת_גיאו: e.geofence_warning ? 'כן' : '',
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 10 }]
      ws['!freeze'] = { xSplit: 0, ySplit: 1 }
      ws['!autofilter'] = { ref: ws['!ref'] as string }
      applyHeaderStyle(ws, 6)
      applyDataStyles(ws, rows.length, 6)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet([
          { טווח: rangeLabel, הופק: new Date().toLocaleString('he-IL'), רשומות: rows.length },
        ]),
        'Meta'
      )
      XLSX.utils.book_append_sheet(wb, ws, 'שעות')
      const safePeriod =
        period === 'custom' ? `attendance-${customFrom || 'from'}-${customTo || 'to'}` : `attendance-${period}`
      XLSX.writeFile(wb, `${safePeriod}.xlsx`)
      toast.success(TM.excelExported)
    } catch {
      toast.error(TM.genericSaveError)
    } finally {
      setExporting(false)
    }
  }

  function renderLocationCell(entry: TimeEntry) {
    const parts: { label: string; lat: number; lng: number }[] = []
    if (entry.clock_in_lat != null && entry.clock_in_lng != null) {
      parts.push({ label: 'כניסה', lat: entry.clock_in_lat, lng: entry.clock_in_lng })
    }
    if (entry.clock_out_lat != null && entry.clock_out_lng != null) {
      parts.push({ label: 'יציאה', lat: entry.clock_out_lat, lng: entry.clock_out_lng })
    }
    if (parts.length === 0) return <span style={styles.mutedCell}>—</span>
    return (
      <span style={styles.locationLinks}>
        {parts.map((p, i) => (
          <span key={p.label}>
            {i > 0 ? ' · ' : null}
            <a href={mapsLink(p.lat, p.lng)} target="_blank" rel="noreferrer" style={styles.mapLink}>
              {p.label}
            </a>
          </span>
        ))}
      </span>
    )
  }

  const headerActions = (
    <>
      <Button variant="secondary" onClick={() => void exportExcel()} loading={exporting} disabled={!data?.entries.length}>
        ייצוא Excel
      </Button>
      <Button variant="primary" onClick={openCreateStaff}>
        הוספת עובדת
      </Button>
    </>
  )

  return (
    <AppShell isMobile={isMobile}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #attendance-print-area, #attendance-print-area * { visibility: visible !important; }
          #attendance-print-area {
            position: fixed;
            left: 0;
            top: 0;
            width: 100%;
            padding: 24px;
            background: white;
          }
          #attendance-print-area .attendance-print-title {
            display: block !important;
          }
        }
      `}</style>

      {isMobile && (
        <MobileHeader
          title="נוכחות משרד"
          subtitle={data ? `${data.stats.active_staff} עובדות פעילות` : ''}
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
            title="נוכחות משרד"
            subtitle="QR בכניסה — החתמת שעות מהטלפון האישי"
            actions={headerActions}
          />
        )}

        {isMobile && (
          <div style={styles.mobileActionsRow}>
            <Button variant="primary" size="sm" onClick={openCreateStaff}>
              עובדת חדשה
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void exportExcel()} loading={exporting}>
              Excel
            </Button>
          </div>
        )}

        {loading ? (
          <>
            <PageKpiSkeletonN columns={3} />
            <Card noPadding>
              <div style={{ padding: '20px 16px' }}>
                <PageListSkeleton rows={6} />
                <div style={styles.loadingContainer}>
                  <LoadingSpinner />
                </div>
              </div>
            </Card>
          </>
        ) : !manageQuery ? (
          <EmptyState
            title="בחרו טווח תאריכים"
            description={period === 'custom' ? 'הזינו תאריך התחלה וסיום.' : 'טווח לא תקין.'}
          />
        ) : !data ? (
          <EmptyState title="לא נטען" description={TM.genericLoadError} />
        ) : (
          <>
            <div
              style={{
                ...styles.kpiGrid,
                gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(3, 1fr)',
              }}
            >
              <KpiCard label="במשמרת עכשיו" value={data.stats.open_count} accent="primary" />
              <KpiCard
                label={activeRange?.label ? `שעות (${activeRange.label})` : 'שעות'}
                value={data.stats.total_hours}
                accent="success"
              />
              <KpiCard label="עובדות פעילות" value={data.stats.active_staff} />
            </div>

            <Card
              title="טווח תאריכים"
              subtitle="מסנן את טבלת הרישומים וסיכום השעות"
              style={{ marginBottom: '24px' }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '12px',
                  alignItems: isMobile ? 'stretch' : 'center',
                  flexDirection: isMobile ? 'column' : 'row',
                }}
              >
                <Select
                  value={period}
                  onChange={(v) => setPeriod(v as Period)}
                  options={[
                    { label: 'היום', value: 'today' },
                    { label: 'השבוע', value: 'week' },
                    { label: 'החודש', value: 'month' },
                    { label: 'מותאם אישית', value: 'custom' },
                  ]}
                  style={{ minWidth: isMobile ? '100%' : '160px' }}
                />
                {period === 'custom' && (
                  <>
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      style={styles.dateInput}
                      aria-label="מתאריך"
                    />
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      style={styles.dateInput}
                      aria-label="עד תאריך"
                    />
                  </>
                )}
                {isMobile && (
                  <Button variant="secondary" onClick={() => void exportExcel()} loading={exporting}>
                    ייצוא Excel
                  </Button>
                )}
              </div>
            </Card>

            <Card
              title="QR בכניסה למשרד"
              subtitle="הדפיסו והדביקו ליד הדלת. כל עובדת סורקת עם הטלפון ובוחרת את שמה."
              style={{ marginBottom: '24px' }}
            >
              <div style={styles.qrRow}>
                <div ref={qrRef} id="attendance-print-area" style={styles.qrCanvasWrap}>
                  <div ref={printRef}>
                    <QRCodeCanvas value={data.scan_url} size={isMobile ? 160 : 200} level="M" includeMargin />
                    <p className="attendance-print-title" style={styles.printTitle}>
                      נוכחות משרד — סריקת QR
                    </p>
                  </div>
                </div>
                <div style={styles.qrMeta}>
                  <p style={styles.scanUrl}>{data.scan_url}</p>
                  <div style={styles.qrButtons}>
                    <Button variant="primary" onClick={downloadQrPng}>
                      הורדת PNG
                    </Button>
                    <Button variant="secondary" onClick={() => void copyScanLink()}>
                      העתקת קישור
                    </Button>
                    <Button variant="secondary" onClick={printQr}>
                      הדפסה
                    </Button>
                    <Button variant="secondary" onClick={() => void regenerateQr()} loading={regeneratingQr}>
                      ריענון QR
                    </Button>
                  </div>
                </div>
              </div>
            </Card>

            {data.open_shifts.length > 0 && (
              <Card title="במשמרת עכשיו" style={{ marginBottom: '24px' }}>
                <div style={styles.openShiftsList}>
                  {data.open_shifts.map((o) => (
                    <div
                      key={o.id}
                      style={{
                        ...styles.openShiftItem,
                        ...(o.stale ? styles.openShiftStale : {}),
                      }}
                    >
                      <div>
                        <strong>{o.staff_name}</strong>
                        <span style={styles.openShiftTime}>
                          {' '}
                          — כניסה {formatOfficeClockTime(o.clock_in_at)}
                        </span>
                      </div>
                      {o.stale && (
                        <span style={styles.staleBadge} title="משמרת פתוחה מעל 10 שעות">
                          <StatusBadge status="HIGH" size="sm" />
                          <span style={styles.staleLabel}>שכחה לצאת?</span>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card
              noPadding
              title="עובדות משרד"
              subtitle="מופיעות במסך הסריקה כשהן פעילות"
              actions={
                !isMobile ? (
                  <Button variant="primary" size="sm" onClick={openCreateStaff}>
                    הוספת עובדת
                  </Button>
                ) : undefined
              }
              style={{ marginBottom: '24px' }}
            >
              <div
                style={{
                  ...styles.filtersRow,
                  flexDirection: isMobile ? 'column' : 'row',
                }}
              >
                <SearchInput
                  value={staffSearch}
                  onChange={setStaffSearch}
                  placeholder="חיפוש עובדת..."
                  style={{ flex: 1, maxWidth: isMobile ? '100%' : '320px' }}
                />
                <Select
                  value={staffStatusFilter}
                  onChange={(v) => setStaffStatusFilter(v as 'ALL' | 'ACTIVE' | 'INACTIVE')}
                  options={[
                    { label: 'הכל', value: 'ALL' },
                    { label: 'פעילות', value: 'ACTIVE' },
                    { label: 'לא פעילות', value: 'INACTIVE' },
                  ]}
                  style={{ minWidth: '140px' }}
                />
              </div>

              {filteredStaff.length === 0 ? (
                <EmptyState
                  title="לא נמצאו עובדות"
                  description="הוסיפו עובדת או שנו את המסננים."
                  action={
                    <Button variant="primary" onClick={openCreateStaff}>
                      הוספת עובדת
                    </Button>
                  }
                />
              ) : (
                <div
                  style={{
                    ...styles.staffGrid,
                    gridTemplateColumns: isMobile ? '1fr' : undefined,
                  }}
                >
                  {filteredStaff.map((s) => (
                    <div key={s.id} style={styles.staffCard} data-ui="card">
                      <div style={styles.staffHeader}>
                        <div style={styles.avatar}>{getInitials(s.full_name)}</div>
                        <div style={styles.staffInfo}>
                          <div style={styles.staffName}>{s.full_name}</div>
                          <div style={styles.staffSub}>
                            {s.hourly_rate != null ? `₪${s.hourly_rate}/שעה` : 'ללא תעריף שעתי'}
                          </div>
                        </div>
                        <span style={staffStatusBadge(s.is_active)}>{s.is_active ? 'פעילה' : 'לא פעילה'}</span>
                      </div>
                      <div style={styles.staffActions}>
                        <Button variant="secondary" size="sm" style={styles.actionBtn} onClick={() => openEditStaff(s)}>
                          עריכה
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card noPadding title="רישומי שעות" subtitle={activeRange?.label} style={{ marginBottom: '24px' }}>
              {data.entries.length === 0 ? (
                <EmptyState title="אין רישומים" description="בטווח הנבחר עדיין לא נרשמו שעות." />
              ) : (
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>עובדת</th>
                        <th style={styles.th}>כניסה</th>
                        <th style={styles.th}>יציאה</th>
                        <th style={styles.th}>שעות</th>
                        <th style={styles.th}>עלות</th>
                        <th style={styles.th}>מיקום</th>
                        <th style={styles.th} />
                      </tr>
                    </thead>
                    <tbody>
                      {data.entries.map((e, idx) => (
                        <tr
                          key={e.id}
                          style={{
                            ...styles.tr,
                            ...(idx % 2 === 1 ? styles.trZebra : {}),
                          }}
                        >
                          <td style={styles.td}>
                            <span style={styles.tdName}>{e.staff_name}</span>
                            {e.geofence_warning && (
                              <span style={styles.geoWarnWrap}>
                                <StatusBadge status="HIGH" size="sm" />
                              </span>
                            )}
                          </td>
                          <td style={styles.td}>{formatOfficeClockTime(e.clock_in_at)}</td>
                          <td style={styles.td}>
                            {e.clock_out_at ? formatOfficeClockTime(e.clock_out_at) : '—'}
                          </td>
                          <td style={styles.td}>{e.hours_label || (e.clock_out_at ? '—' : 'במשמרת')}</td>
                          <td style={styles.td}>{e.cost != null ? `₪${e.cost}` : '—'}</td>
                          <td style={styles.td}>{renderLocationCell(e)}</td>
                          <td style={styles.td}>
                            <Button variant="ghost" size="sm" onClick={() => openEditEntry(e)}>
                              תיקון
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card title="גדר גיאוגרפית" subtitle="אזהרה ברישום אם ה-GPS רחוק מהמשרד">
              <button
                type="button"
                onClick={() => setGeofenceOpen((o) => !o)}
                style={styles.geofenceToggle}
              >
                {geofenceOpen ? 'הסתר הגדרות' : 'הצג הגדרות'}
              </button>
              {geofenceOpen && (
                <div style={styles.geofenceForm}>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>קו רוחב (lat)</label>
                    <input
                      value={geofenceForm.lat}
                      onChange={(ev) => setGeofenceForm((f) => ({ ...f, lat: ev.target.value }))}
                      placeholder="למשל 32.0853"
                      style={styles.input}
                      inputMode="decimal"
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>קו אורך (lng)</label>
                    <input
                      value={geofenceForm.lng}
                      onChange={(ev) => setGeofenceForm((f) => ({ ...f, lng: ev.target.value }))}
                      placeholder="למשל 34.7818"
                      style={styles.input}
                      inputMode="decimal"
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>רדיוס (מטרים)</label>
                    <input
                      value={geofenceForm.radius}
                      onChange={(ev) => setGeofenceForm((f) => ({ ...f, radius: ev.target.value }))}
                      style={styles.input}
                      inputMode="numeric"
                    />
                  </div>
                  <Button variant="primary" onClick={() => void saveGeofence()} loading={savingGeofence}>
                    שמירת גדר
                  </Button>
                </div>
              )}
            </Card>
          </>
        )}
      </div>

      <Drawer
        open={staffDrawerOpen}
        onClose={closeStaffDrawer}
        title={editingStaff ? 'עריכת עובדת' : 'עובדת חדשה'}
        subtitle={editingStaff ? 'עדכון פרטים ותעריף' : 'הוספה למסך הסריקה'}
        isMobile={isMobile}
      >
        <div style={styles.drawerContent}>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>שם מלא *</label>
            <input
              value={staffForm.full_name}
              onChange={(ev) => setStaffForm((f) => ({ ...f, full_name: ev.target.value }))}
              style={styles.input}
              placeholder="שם מלא"
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>תעריף שעתי (₪)</label>
            <input
              value={staffForm.hourly_rate}
              onChange={(ev) => setStaffForm((f) => ({ ...f, hourly_rate: ev.target.value }))}
              style={styles.input}
              inputMode="decimal"
              placeholder="אופציונלי"
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={staffForm.is_active}
                onChange={(ev) => setStaffForm((f) => ({ ...f, is_active: ev.target.checked }))}
                style={styles.checkbox}
              />
              <span>פעילה (מופיעה בסריקה)</span>
            </label>
          </div>
          <div style={styles.drawerActions}>
            <Button variant="secondary" onClick={closeStaffDrawer}>
              ביטול
            </Button>
            <Button variant="primary" onClick={() => void saveStaff()} loading={savingStaff}>
              שמירה
            </Button>
          </div>
        </div>
      </Drawer>

      <Drawer
        open={entryDrawerOpen}
        onClose={closeEntryDrawer}
        title="תיקון רישום שעות"
        subtitle={editingEntry?.staff_name}
        isMobile={isMobile}
      >
        <div style={styles.drawerContent}>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>שעת כניסה</label>
            <input
              type="datetime-local"
              value={entryForm.clock_in_at}
              onChange={(ev) => setEntryForm((f) => ({ ...f, clock_in_at: ev.target.value }))}
              style={styles.input}
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>שעת יציאה (ריק = במשמרת)</label>
            <input
              type="datetime-local"
              value={entryForm.clock_out_at}
              onChange={(ev) => setEntryForm((f) => ({ ...f, clock_out_at: ev.target.value }))}
              style={styles.input}
            />
          </div>
          <div style={styles.drawerActions}>
            <Button variant="secondary" onClick={closeEntryDrawer}>
              ביטול
            </Button>
            <Button variant="primary" onClick={() => void saveEntry()} loading={savingEntry}>
              שמירה
            </Button>
          </div>
        </div>
      </Drawer>
    </AppShell>
  )
}

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
  mobileActionsRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px',
    flexWrap: 'wrap',
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
  dateInput: {
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    fontSize: '14px',
    background: theme.colors.surface,
  },
  qrRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '24px',
    alignItems: 'flex-start',
  },
  qrCanvasWrap: {
    padding: '12px',
    background: '#fff',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
  },
  printTitle: {
    display: 'none',
    margin: '12px 0 0',
    fontSize: '18px',
    fontWeight: 700,
    textAlign: 'center',
  },
  qrMeta: {
    flex: 1,
    minWidth: '200px',
  },
  scanUrl: {
    fontSize: '13px',
    color: theme.colors.textMuted,
    wordBreak: 'break-all',
    margin: 0,
  },
  qrButtons: {
    display: 'flex',
    gap: '8px',
    marginTop: '12px',
    flexWrap: 'wrap',
  },
  openShiftsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  openShiftItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 14px',
    borderRadius: theme.radius.md,
    background: theme.colors.muted,
    flexWrap: 'wrap',
  },
  openShiftStale: {
    background: theme.colors.warningMuted,
    border: `1px solid ${theme.colors.warning}`,
  },
  openShiftTime: {
    fontSize: '14px',
    color: theme.colors.textSecondary,
  },
  staleBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  },
  staleLabel: {
    fontSize: '12px',
    color: theme.colors.warning,
    fontWeight: 600,
  },
  staffGrid: {
    display: 'grid',
    gap: '20px',
    padding: '24px',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  },
  staffCard: {
    background: theme.colors.surface,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.lg,
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  staffHeader: {
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
  staffInfo: {
    flex: 1,
    minWidth: 0,
  },
  staffName: {
    fontSize: '16px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  staffSub: {
    fontSize: '13px',
    color: theme.colors.textMuted,
    marginTop: '2px',
  },
  staffActions: {
    marginTop: 'auto',
  },
  actionBtn: {
    width: '100%',
    justifyContent: 'center',
  },
  tableWrap: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
  },
  th: {
    textAlign: 'right',
    padding: '14px 16px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
    borderBottom: `2px solid ${theme.colors.border}`,
    background: theme.colors.muted,
    whiteSpace: 'nowrap',
  },
  tr: {
    borderBottom: `1px solid ${theme.colors.border}`,
    transition: 'background 0.15s ease',
  },
  trZebra: {
    background: theme.colors.muted,
  },
  td: {
    padding: '12px 16px',
    color: theme.colors.textPrimary,
    verticalAlign: 'middle',
  },
  tdName: {
    fontWeight: 500,
    marginLeft: '8px',
  },
  geoWarnWrap: {
    display: 'inline-flex',
    marginRight: '6px',
    verticalAlign: 'middle',
  },
  mutedCell: {
    color: theme.colors.textMuted,
  },
  locationLinks: {
    fontSize: '13px',
  },
  mapLink: {
    color: theme.colors.primary,
    textDecoration: 'underline',
  },
  geofenceToggle: {
    background: 'none',
    border: 'none',
    color: theme.colors.primary,
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
    marginBottom: '12px',
  },
  geofenceForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    maxWidth: '400px',
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
}
