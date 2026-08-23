'use client'

/**
 * דף יומן משרד — פגישות ועד, אנשי מקצוע ואירועים פנימיים.
 * תצוגת חודש/שבוע, יצירה/עריכה/מחיקה, ייצוא iCal, סנכרון Google Calendar.
 */
import { useCallback, useEffect, useMemo, useState, Suspense, type CSSProperties } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { resolveBamakorClientIdForBrowser } from '@/lib/bamakor-client'
import { withClientId } from '@/lib/supabase/with-client-id'
import { toast, asyncHandler, errorMessageFromResponseJson } from '@/lib/error-handler'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { TM } from '@/lib/toast-messages'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import {
  CALENDAR_EVENT_TYPE_LABELS,
  dateKeyLocal,
  googleCalendarTemplateUrl,
  monthRangeIso,
  toLocalDatetimeInput,
  weekRangeIso,
  type CalendarEventType,
} from '@/lib/calendar-utils'
import { startGoogleCalendarConnect } from '@/lib/google-calendar-connect'
import { CalendarMonthGrid } from '../components/calendar/CalendarMonthGrid'
import {
  AppShell,
  MobileHeader,
  useMobileMenu,
  PageHeader,
  KpiCard,
  Card,
  Button,
  Drawer,
  EmptyState,
  SearchInput,
  Select,
  theme,
} from '../components/ui'
import { PageTransitionLoader } from '../components/page-skeleton'
import { PaidAddonGate } from '../components/PaidAddonGate'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'

type CalendarEvent = {
  id: string
  title: string
  description: string | null
  location: string | null
  starts_at: string
  ends_at: string
  all_day: boolean
  project_id: string | null
  project_name: string | null
  event_type: CalendarEventType
}

type ProjectOption = { id: string; name: string }
type ViewMode = 'month' | 'week'

const emptyForm = {
  title: '',
  description: '',
  location: '',
  starts_at: '',
  ends_at: '',
  project_id: '',
  event_type: 'other' as CalendarEventType,
  all_day: false,
}

export default function CalendarPage() {
  return (
    <Suspense fallback={null}>
      <CalendarPageInner />
    </Suspense>
  )
}

function CalendarPageInner() {
  const { openMenu } = useMobileMenu()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isMobile, setIsMobile] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [gcalBusy, setGcalBusy] = useState(false)
  const [gcal, setGcal] = useState<{
    configured: boolean
    connected: boolean
    google_email: string | null
  } | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [cursor, setCursor] = useState(() => {
    const n = new Date()
    return { year: n.getFullYear(), month: n.getMonth(), day: n.getDate() }
  })
  const [selectedDay, setSelectedDay] = useState<Date | null>(() => new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<CalendarEvent | null>(null)
  const [form, setForm] = useState(emptyForm)

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const loadGcalStatus = useCallback(async () => {
    const res = await fetchWithTimeout('/api/calendar/google', { method: 'GET' })
    if (!res?.ok) return
    const body = (await res.json()) as {
      configured?: boolean
      connected?: boolean
      google_email?: string | null
    }
    setGcal({
      configured: Boolean(body.configured),
      connected: Boolean(body.connected),
      google_email: body.google_email ?? null,
    })
  }, [])

  useEffect(() => {
    const flag = searchParams.get('gcal')
    if (!flag) return
    if (flag === 'connected') {
      toast.success('Google Calendar חובר ✓ — אירועים חדשים יועתקו אוטומטית')
      void loadGcalStatus()
    } else if (flag === 'need_consent') {
      toast.error('נדרשת הרשאה מלאה ליומן. לחצו שוב על «חיבור Google Calendar».')
    } else if (flag === 'error') {
      toast.error('חיבור Google Calendar נכשל')
    }
    router.replace('/calendar', { scroll: false })
  }, [searchParams, router, loadGcalStatus])

  const monthRange = useMemo(() => monthRangeIso(cursor.year, cursor.month), [cursor])
  const fetchRange = useMemo(() => {
    if (viewMode === 'week' && selectedDay) {
      return weekRangeIso(selectedDay.getFullYear(), selectedDay.getMonth(), selectedDay.getDate())
    }
    return { from: monthRange.from, to: monthRange.to, label: monthRange.label }
  }, [viewMode, selectedDay, monthRange])

  const load = useCallback(async () => {
    const res = await fetchWithTimeout(
      `/api/calendar/events?from=${encodeURIComponent(fetchRange.from)}&to=${encodeURIComponent(fetchRange.to)}`,
      { method: 'GET' }
    )
    const body = (await res.json()) as { events?: CalendarEvent[]; error?: string }
    if (!res.ok) throw new Error(body.error || TM.genericLoadError)
    setEvents(body.events || [])
  }, [fetchRange.from, fetchRange.to])

  useEffect(() => {
    void asyncHandler(
      async () => {
        setLoading(true)
        const clientId = await resolveBamakorClientIdForBrowser()
        const { data: projData } = await withClientId(
          supabase.from('projects').select('id, name').order('name'),
          clientId
        )
        setProjects((projData as ProjectOption[]) || [])
        await Promise.all([load(), loadGcalStatus()])
        return true
      },
      { context: 'טעינת יומן', showErrorToast: true }
    ).finally(() => setLoading(false))
  }, [load, loadGcalStatus])

  async function connectGoogleCalendar() {
    setGcalBusy(true)
    try {
      await startGoogleCalendarConnect()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'חיבור Google נכשל')
      setGcalBusy(false)
    }
  }

  async function disconnectGoogleCalendar() {
    if (!confirm('לנתק את Google Calendar? אירועים חדשים לא יועתקו יותר.')) return
    setGcalBusy(true)
    try {
      const res = await fetchWithTimeout('/api/calendar/google', { method: 'DELETE' })
      if (!res?.ok) throw new Error('ניתוק נכשל')
      toast.success('Google Calendar נותק')
      await loadGcalStatus()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'ניתוק נכשל')
    } finally {
      setGcalBusy(false)
    }
  }
  const eventCountByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const ev of events) {
      const key = dateKeyLocal(new Date(ev.starts_at))
      map.set(key, (map.get(key) || 0) + 1)
    }
    return map
  }, [events])

  const filteredEvents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return events.filter((ev) => {
      if (projectFilter && ev.project_id !== projectFilter) return false
      if (!q) return true
      return (
        ev.title.toLowerCase().includes(q) ||
        (ev.location || '').toLowerCase().includes(q) ||
        (ev.description || '').toLowerCase().includes(q)
      )
    })
  }, [events, searchTerm, projectFilter])

  const dayEvents = useMemo(() => {
    if (viewMode === 'week') {
      const { from, to } = weekRangeIso(
        selectedDay?.getFullYear() ?? cursor.year,
        selectedDay?.getMonth() ?? cursor.month,
        selectedDay?.getDate() ?? cursor.day
      )
      const fromT = new Date(from).getTime()
      const toT = new Date(to).getTime()
      return filteredEvents.filter((ev) => {
        const t = new Date(ev.starts_at).getTime()
        return t >= fromT && t < toT
      })
    }
    if (!selectedDay) return filteredEvents
    const key = dateKeyLocal(selectedDay)
    return filteredEvents.filter((ev) => dateKeyLocal(new Date(ev.starts_at)) === key)
  }, [filteredEvents, selectedDay, viewMode, cursor])

  const kpi = useMemo(() => {
    const now = new Date()
    const todayKey = dateKeyLocal(now)
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay())
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    let today = 0
    let week = 0
    let month = 0
    for (const ev of events) {
      const d = new Date(ev.starts_at)
      month++
      if (d >= weekStart) week++
      if (dateKeyLocal(d) === todayKey) today++
    }
    return { today, week, month }
  }, [events])

  function openCreate() {
    setEditing(null)
    const start = selectedDay ? new Date(selectedDay) : new Date()
    start.setHours(9, 0, 0, 0)
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    setForm({
      ...emptyForm,
      starts_at: toLocalDatetimeInput(start),
      ends_at: toLocalDatetimeInput(end),
    })
    setDrawerOpen(true)
  }

  function openEdit(ev: CalendarEvent) {
    setEditing(ev)
    setForm({
      title: ev.title,
      description: ev.description || '',
      location: ev.location || '',
      starts_at: toLocalDatetimeInput(new Date(ev.starts_at)),
      ends_at: toLocalDatetimeInput(new Date(ev.ends_at)),
      project_id: ev.project_id || '',
      event_type: ev.event_type,
      all_day: ev.all_day,
    })
    setDrawerOpen(true)
  }

  async function saveEvent() {
    const title = form.title.trim()
    if (!title || !form.starts_at || !form.ends_at) {
      toast.error('נא למלא כותרת ושעות')
      return
    }
    setSaving(true)
    try {
      const payload = {
        title,
        description: form.description.trim() || null,
        location: form.location.trim() || null,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
        project_id: form.project_id || null,
        event_type: form.event_type,
        all_day: form.all_day,
      }
      const res = editing
        ? await fetchWithTimeout(`/api/calendar/events/${editing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetchWithTimeout('/api/calendar/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      const body = (await res.json()) as { error?: unknown }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(body, TM.genericSaveError))
      toast.success(editing ? 'האירוע עודכן ✓' : 'האירוע נוסף ✓')
      setDrawerOpen(false)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : TM.genericSaveError)
    } finally {
      setSaving(false)
    }
  }

  async function deleteEvent() {
    if (!editing || !confirm('למחוק את האירוע?')) return
    setSaving(true)
    try {
      const res = await fetchWithTimeout(`/api/calendar/events/${editing.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(TM.genericSaveError)
      toast.success('האירוע נמחק ✓')
      setDrawerOpen(false)
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : TM.genericSaveError)
    } finally {
      setSaving(false)
    }
  }

  function shiftMonth(delta: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth(), day: 1 }
    })
  }

  function exportIcal() {
    const url = `/api/calendar/export/ical?from=${encodeURIComponent(fetchRange.from)}&to=${encodeURIComponent(fetchRange.to)}`
    window.open(url, '_blank')
  }

  return (
    <AppShell isMobile={isMobile}>
      <PaidAddonGate addonKey={PAID_ADDON_KEYS.calendar}>
      {isMobile && (
        <MobileHeader title="יומן משרד" subtitle={monthRange.label} onMenuClick={openMenu} />
      )}

      <div
        style={{
          ...styles.content,
          ...(isMobile ? { padding: '16px 16px 8px', maxWidth: '100%', boxSizing: 'border-box' } : {}),
        }}
      >
        {!isMobile && (
          <PageHeader
            title="יומן משרד"
            subtitle="פגישות ועד, אנשי מקצוע ואירועי משרד"
            actions={
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {gcal?.connected ? (
                  <Button variant="secondary" onClick={() => void disconnectGoogleCalendar()} disabled={gcalBusy}>
                    נתק Google Calendar
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => void connectGoogleCalendar()} disabled={gcalBusy}>
                    {gcalBusy ? 'מחברים…' : 'חיבור Google Calendar'}
                  </Button>
                )}
                <Button variant="secondary" onClick={exportIcal}>
                  ייצוא iCal
                </Button>
                <Button variant="primary" onClick={openCreate}>
                  אירוע חדש
                </Button>
              </div>
            }
          />
        )}

        {loading ? (
          <PageTransitionLoader />
        ) : (
          <>
            {isMobile && (
              <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <Button variant="primary" onClick={openCreate}>
                  אירוע חדש
                </Button>
                {gcal?.connected ? (
                  <Button variant="secondary" onClick={() => void disconnectGoogleCalendar()} disabled={gcalBusy}>
                    נתק Google
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => void connectGoogleCalendar()} disabled={gcalBusy}>
                    {gcalBusy ? 'מחברים…' : 'חיבור Google'}
                  </Button>
                )}
              </div>
            )}

            {gcal?.connected ? (
              <p style={{ margin: '0 0 12px', fontSize: '13px', color: theme.colors.textMuted }}>
                Google Calendar מחובר
                {gcal.google_email ? ` (${gcal.google_email})` : ''} — אירועים שנשמרים כאן מתווספים אוטומטית ליומן.
              </p>
            ) : null}
            <div style={{ ...styles.kpiGrid, gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(3, 1fr)' }}>
              <KpiCard label="היום" value={kpi.today} accent="primary" />
              <KpiCard label="השבוע" value={kpi.week} accent="warning" />
              <KpiCard label="בטווח" value={kpi.month} accent="success" />
            </div>

            <Card noPadding style={{ marginBottom: '16px' }}>
              <div style={styles.filtersRow}>
                <Button variant="secondary" size="sm" onClick={() => shiftMonth(-1)}>
                  חודש קודם
                </Button>
                <strong style={{ flex: 1, textAlign: 'center' }}>{monthRange.label}</strong>
                <Button variant="secondary" size="sm" onClick={() => shiftMonth(1)}>
                  חודש הבא
                </Button>
                <Select
                  value={viewMode}
                  onChange={(v) => setViewMode(v as ViewMode)}
                  options={[
                    { label: 'חודש', value: 'month' },
                    { label: 'שבוע', value: 'week' },
                  ]}
                  style={{ minWidth: '100px' }}
                />
              </div>
              {viewMode === 'month' ? (
                <div style={{ padding: '16px 20px 20px' }}>
                  <CalendarMonthGrid
                    year={cursor.year}
                    month={cursor.month}
                    selectedDay={selectedDay}
                    eventCountByDay={eventCountByDay}
                    onSelectDay={(d) => setSelectedDay(d)}
                  />
                </div>
              ) : null}
            </Card>

            <Card noPadding>
              <div style={styles.filtersRow}>
                <SearchInput
                  value={searchTerm}
                  onChange={setSearchTerm}
                  placeholder="חיפוש אירועים..."
                  style={{ flex: 1, maxWidth: isMobile ? '100%' : '280px' }}
                />
                <Select
                  value={projectFilter}
                  onChange={setProjectFilter}
                  options={[
                    { label: 'כל הבניינים', value: '' },
                    ...projects.map((p) => ({ label: p.name, value: p.id })),
                  ]}
                  style={{ minWidth: '140px' }}
                />
              </div>

              <div style={{ padding: '12px 20px 8px', fontWeight: 600 }}>
                {selectedDay
                  ? selectedDay.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })
                  : 'אירועים'}
              </div>

              {dayEvents.length === 0 ? (
                <EmptyState
                  title="אין אירועים"
                  description="בחרו יום אחר או הוסיפו אירוע חדש."
                  action={
                    <Button variant="primary" onClick={openCreate}>
                      אירוע חדש
                    </Button>
                  }
                />
              ) : (
                <div style={{ padding: '0 12px 20px' }}>
                  {dayEvents.map((ev) => (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => openEdit(ev)}
                      style={styles.eventRow}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={styles.typeBadge}>{CALENDAR_EVENT_TYPE_LABELS[ev.event_type]}</span>
                        <strong>{ev.title}</strong>
                      </div>
                      <div style={styles.eventMeta}>
                        {ev.all_day
                          ? 'כל היום'
                          : `${new Date(ev.starts_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })} – ${new Date(ev.ends_at).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`}
                        {ev.project_name ? ` · ${ev.project_name}` : ''}
                        {ev.location ? ` · ${ev.location}` : ''}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => !saving && setDrawerOpen(false)}
        title={editing ? 'עריכת אירוע' : 'אירוע חדש'}
        isMobile={isMobile}
        footer={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setDrawerOpen(false)} disabled={saving}>
              ביטול
            </Button>
            {editing ? (
              <Button variant="danger" onClick={() => void deleteEvent()} disabled={saving}>
                מחיקה
              </Button>
            ) : null}
            <Button variant="primary" onClick={() => void saveEvent()} disabled={saving}>
              {saving ? 'שומר…' : 'שמירה'}
            </Button>
          </div>
        }
      >
        <div style={styles.formGroup}>
          <label style={styles.label}>כותרת</label>
          <input style={styles.input} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>סוג</label>
          <Select
            value={form.event_type}
            onChange={(v) => setForm((f) => ({ ...f, event_type: v as CalendarEventType }))}
            options={(Object.keys(CALENDAR_EVENT_TYPE_LABELS) as CalendarEventType[]).map((k) => ({
              label: CALENDAR_EVENT_TYPE_LABELS[k],
              value: k,
            }))}
          />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>
            <input type="checkbox" checked={form.all_day} onChange={(e) => setForm((f) => ({ ...f, all_day: e.target.checked }))} />{' '}
            כל היום
          </label>
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>התחלה</label>
          <input style={styles.input} type="datetime-local" value={form.starts_at} onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>סיום</label>
          <input style={styles.input} type="datetime-local" value={form.ends_at} onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>מיקום</label>
          <input style={styles.input} value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>בניין</label>
          <Select
            value={form.project_id}
            onChange={(v) => setForm((f) => ({ ...f, project_id: v }))}
            options={[{ label: '—', value: '' }, ...projects.map((p) => ({ label: p.name, value: p.id }))]}
          />
        </div>
        <div style={styles.formGroup}>
          <label style={styles.label}>הערות</label>
          <textarea style={{ ...styles.input, minHeight: 72 }} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
        {editing ? (
          <div style={{ marginTop: '12px' }}>
            <a
              href={googleCalendarTemplateUrl({
                title: editing.title,
                starts_at: editing.starts_at,
                ends_at: editing.ends_at,
                location: editing.location,
                details: editing.description,
              })}
              target="_blank"
              rel="noreferrer"
              style={{ color: theme.colors.primary, fontSize: '14px' }}
            >
              הוספה ל-Google Calendar
            </a>
          </div>
        ) : null}
      </Drawer>
      </PaidAddonGate>
    </AppShell>
  )
}

const styles: Record<string, CSSProperties> = {
  content: { padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' },
  kpiGrid: { display: 'grid', gap: '16px', marginBottom: '24px' },
  filtersRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 20px',
    borderBottom: `1px solid ${theme.colors.border}`,
    flexWrap: 'wrap',
  },
  eventRow: {
    display: 'block',
    width: '100%',
    textAlign: 'right',
    padding: '14px 12px',
    marginBottom: '8px',
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.md,
    background: theme.colors.surface,
    cursor: 'pointer',
  },
  eventMeta: { fontSize: '13px', color: theme.colors.textMuted, marginTop: '6px' },
  formGroup: { marginBottom: '14px' },
  label: { display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '6px' },
  input: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    fontSize: '15px',
    boxSizing: 'border-box',
  },
  typeBadge: {
    fontSize: '11px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: theme.radius.full,
    background: theme.colors.primaryMuted,
    color: theme.colors.primary,
  },
}
