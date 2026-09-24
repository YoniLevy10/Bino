'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'next/navigation'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { monthBounds } from '@/lib/attendance-display'
import { useAttendanceDashboard } from '@/lib/hooks/use-attendance-dashboard'
import {
  AppShell,
  MobileHeader,
  useMobileMenu,
  PageHeader,
  Card,
  Button,
  theme,
} from '../components/ui'
import { PageTransitionLoader } from '../components/page-skeleton'
import { PaidAddonGate } from '../components/PaidAddonGate'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { AttendanceShiftsReport } from '../components/attendance/AttendanceShiftsReport'
import { AttendanceHelpContact } from '../components/attendance/AttendanceHelpContact'
import { AttendanceAnomalies, type AttendanceAnomaliesData } from '../components/attendance/AttendanceAnomalies'
import { AttendanceHistoryTab } from '../components/attendance/AttendanceHistoryTab'
import { EVENT_TYPE_HE } from '@/lib/attendance-display'

type PageTab = 'current' | 'history'

type AttendanceEventRow = {
  id: string
  worker_id: string
  project_id: string | null
  tag_code: string | null
  event_type: string
  client_recorded_at: string
  sync_status: string
  workers?: { full_name?: string } | { full_name?: string }[] | null
  projects?: { name?: string } | { name?: string }[] | null
}

const SYNC_STATUS_HE: Record<string, string> = {
  synced: 'תקין',
  pending_review: 'לבדיקה',
  conflict: 'חריג',
  rejected: 'נדחה',
}

function workerName(row: AttendanceEventRow): string {
  const w = row.workers
  if (!w) return '—'
  if (Array.isArray(w)) return w[0]?.full_name ?? '—'
  return w.full_name ?? '—'
}

function projectName(row: AttendanceEventRow): string {
  if (row.tag_code && !row.project_id) return 'משרד'
  const p = row.projects
  if (!p) return row.tag_code ?? '—'
  if (Array.isArray(p)) return p[0]?.name ?? '—'
  return p.name ?? '—'
}

type TodaySummary = {
  active_now: { worker_id: string; full_name: string; started_at: string }[]
  clocked_in_today: { worker_id: string; full_name: string }[]
  missing_checkout: { worker_id: string; full_name: string; started_at: string }[]
}

const defaultKpis = {
  active_workers_now: 0,
  clock_ins_today: 0,
  pending_review: 0,
}

function formatShortTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

export default function AttendancePage() {
  const { openMenu } = useMobileMenu()
  const searchParams = useSearchParams()
  const [pageTab, setPageTab] = useState<PageTab>('current')
  const [syncFilter, setSyncFilter] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const currentMonthBounds = useMemo(() => {
    const d = new Date()
    return monthBounds(d.getFullYear(), d.getMonth())
  }, [])

  const {
    data: dashboardData,
    isLoading,
    hasData,
    error: dashboardError,
    refetch,
  } = useAttendanceDashboard({
    from: currentMonthBounds.from,
    to: currentMonthBounds.to,
    syncFilter,
    enabled: pageTab === 'current',
  })

  const events = (dashboardData?.events as AttendanceEventRow[] | undefined) ?? []
  const kpis = dashboardData?.kpis ?? defaultKpis
  const todaySummary = (dashboardData?.today_summary as TodaySummary | null | undefined) ?? null
  const anomalies = (dashboardData?.anomalies as AttendanceAnomaliesData | null | undefined) ?? null
  const prefetchedShifts = hasData ? (dashboardData?.shifts ?? []) : undefined
  const loading = isLoading && !hasData

  useEffect(() => {
    if (searchParams.get('tab') === 'history') setPageTab('history')
  }, [searchParams])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (pageTab === 'history') params.set('tab', 'history')
    else params.delete('tab')
    const qs = params.toString()
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname
    window.history.replaceState(null, '', newUrl)
  }, [pageTab])

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (!dashboardError) return
    toast.error(dashboardError instanceof Error ? dashboardError.message : 'טעינה נכשלה')
  }, [dashboardError])

  const load = useCallback(async () => {
    await refetch()
  }, [refetch])

  async function approveEvent(id: string) {
    setBusyId(id)
    try {
      const res = await fetchWithTimeout('/api/attendance/events/review', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: id, sync_status: 'synced', admin_note: 'אושר ידנית' }),
      })
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(body.error || 'עדכון נכשל')
      toast.success('עודכן')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'עדכון נכשל')
    } finally {
      setBusyId(null)
    }
  }

  const missingCheckoutCount = todaySummary?.missing_checkout?.length ?? 0
  const activeNow = todaySummary?.active_now ?? []
  const missingCheckout = todaySummary?.missing_checkout ?? []

  const kpiTiles = [
    {
      key: 'active',
      value: kpis.active_workers_now,
      label: 'בשטח עכשיו',
      accent: theme.colors.primary,
    },
    {
      key: 'ins',
      value: kpis.clock_ins_today,
      label: 'כניסות היום',
      accent: theme.colors.textPrimary,
    },
    {
      key: 'pending',
      value: kpis.pending_review,
      label: 'ממתינים לאישור',
      accent: kpis.pending_review > 0 ? theme.colors.warning : theme.colors.textPrimary,
    },
    {
      key: 'missing',
      value: missingCheckoutCount,
      label: 'חסרה יציאה',
      accent: missingCheckoutCount > 0 ? theme.colors.error : theme.colors.textPrimary,
    },
  ]

  const currentTabContent = (
    <>
      <div style={{ ...styles.kpiGrid, gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)' }}>
        {kpiTiles.map((tile) => (
          <Card key={tile.key} style={styles.kpiCard}>
            <div style={{ ...styles.kpiValue, color: tile.accent }}>{loading ? '—' : tile.value}</div>
            <div style={styles.kpiLabel}>{tile.label}</div>
          </Card>
        ))}
      </div>

      {(activeNow.length > 0 || missingCheckout.length > 0) && !loading ? (
        <Card style={styles.snapshotCard}>
          <h3 style={styles.sectionTitle}>מי נכנס מתי</h3>
          {activeNow.length > 0 ? (
            <div style={styles.snapshotBlock}>
              <div style={styles.snapshotLabel}>במשמרת עכשיו</div>
              <ul style={styles.snapshotList}>
                {activeNow.slice(0, isMobile ? 4 : 8).map((w) => (
                  <li key={w.worker_id} style={styles.snapshotItem}>
                    <span style={styles.snapshotName}>{w.full_name}</span>
                    <span style={styles.snapshotMeta}>מ־{formatShortTime(w.started_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {missingCheckout.length > 0 ? (
            <div style={styles.snapshotBlock}>
              <div style={{ ...styles.snapshotLabel, color: theme.colors.error }}>חסרה יציאה</div>
              <ul style={styles.snapshotList}>
                {missingCheckout.slice(0, isMobile ? 4 : 8).map((w) => (
                  <li key={w.worker_id} style={styles.snapshotItem}>
                    <span style={styles.snapshotName}>{w.full_name}</span>
                    <span style={styles.snapshotMeta}>נכנס {formatShortTime(w.started_at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      ) : null}

      <AttendanceAnomalies data={anomalies} loading={loading} />

      <AttendanceShiftsReport
        lockToCurrentMonth
        prefetchedShifts={prefetchedShifts as never}
        prefetchVersion={hasData ? 1 : 0}
        isMobile={isMobile}
      />

      <Card>
        <h3 style={styles.sectionTitle}>החתמות החודש ({currentMonthBounds.label})</h3>
        <p style={styles.hint}>מי נכנס ומתי — החודש הנוכחי. חודשים קודמים בלשונית «היסטוריה».</p>
        <div style={{ ...styles.filters, flexDirection: isMobile ? 'column' : 'row' }}>
          {kpis.pending_review > 0 ? (
            <select
              style={{ ...styles.input, width: isMobile ? '100%' : undefined }}
              value={syncFilter}
              onChange={(e) => setSyncFilter(e.target.value)}
            >
              <option value="">הכל</option>
              <option value="pending_review">רק שדורשות בדיקה</option>
              <option value="synced">תקין</option>
            </select>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void load()}
            style={isMobile ? { width: '100%', minHeight: 48 } : undefined}
          >
            רענון
          </Button>
        </div>

        {loading ? (
          <PageTransitionLoader />
        ) : events.length === 0 ? (
          <p style={styles.hint}>עדיין אין החתמות החודש — אחרי שהעובדים יצמידו את הטלפון למדבקה, יופיעו כאן.</p>
        ) : isMobile ? (
          <div style={styles.mobileList}>
            {events.map((row) => (
              <div key={row.id} style={styles.eventCard}>
                <div style={styles.eventCardTop}>
                  <span style={styles.eventName}>{workerName(row)}</span>
                  <span style={styles.eventType}>{EVENT_TYPE_HE[row.event_type] ?? row.event_type}</span>
                </div>
                <div style={styles.eventMeta}>
                  {projectName(row)} · {new Date(row.client_recorded_at).toLocaleString('he-IL')}
                </div>
                <div style={styles.eventActions}>
                  {row.sync_status === 'pending_review' || row.sync_status === 'conflict' ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={busyId === row.id}
                      onClick={() => void approveEvent(row.id)}
                      style={{ minHeight: 44, width: '100%' }}
                    >
                      אשר
                    </Button>
                  ) : (
                    <span style={{ fontSize: 12, color: theme.colors.textMuted }}>
                      {SYNC_STATUS_HE[row.sync_status] ?? row.sync_status}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>עובד</th>
                  <th style={styles.th}>מה קרה</th>
                  <th style={styles.th}>איפה</th>
                  <th style={styles.th}>מתי</th>
                  <th style={styles.th}></th>
                </tr>
              </thead>
              <tbody>
                {events.map((row) => (
                  <tr key={row.id}>
                    <td style={styles.td}>{workerName(row)}</td>
                    <td style={styles.td}>{EVENT_TYPE_HE[row.event_type] ?? row.event_type}</td>
                    <td style={styles.td}>{projectName(row)}</td>
                    <td style={styles.td}>
                      {new Date(row.client_recorded_at).toLocaleString('he-IL')}
                    </td>
                    <td style={styles.td}>
                      {row.sync_status === 'pending_review' || row.sync_status === 'conflict' ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={busyId === row.id}
                          onClick={() => void approveEvent(row.id)}
                        >
                          אשר
                        </Button>
                      ) : (
                        <span style={{ fontSize: 12, color: theme.colors.textMuted }}>
                          {SYNC_STATUS_HE[row.sync_status] ?? row.sync_status}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AttendanceHelpContact />
    </>
  )

  return (
    <AppShell isMobile={isMobile}>
      <PaidAddonGate addonKey={PAID_ADDON_KEYS.worker_stamp}>
        {isMobile && (
          <MobileHeader
            title="חתמת עובדים"
            subtitle={pageTab === 'history' ? 'ארכיון חודשי' : currentMonthBounds.label}
            onMenuClick={openMenu}
          />
        )}
        <div
          style={{
            padding: isMobile ? '16px 16px 32px' : '32px 40px',
            maxWidth: isMobile ? '100%' : 1200,
            margin: '0 auto',
            boxSizing: 'border-box',
          }}
        >
          {!isMobile && (
            <PageHeader
              title="חתמת עובדים"
              subtitle={
                pageTab === 'history'
                  ? 'ארכיון משמרות לפי חודש'
                  : `מעקב שעות — ${currentMonthBounds.label}`
              }
            />
          )}

          <div style={styles.pageTabBar}>
            <button
              type="button"
              onClick={() => setPageTab('current')}
              style={{
                ...styles.pageTab,
                ...(pageTab === 'current' ? styles.pageTabActive : styles.pageTabInactive),
              }}
            >
              חודש נוכחי
            </button>
            <button
              type="button"
              onClick={() => setPageTab('history')}
              style={{
                ...styles.pageTab,
                ...(pageTab === 'history' ? styles.pageTabActive : styles.pageTabInactive),
              }}
            >
              היסטוריה
            </button>
          </div>

          {pageTab === 'history' ? <AttendanceHistoryTab isMobile={isMobile} /> : currentTabContent}
        </div>
      </PaidAddonGate>
    </AppShell>
  )
}

const styles: Record<string, CSSProperties> = {
  pageTabBar: {
    display: 'flex',
    gap: '4px',
    padding: '4px',
    background: theme.colors.muted,
    borderRadius: theme.radius.md,
    marginBottom: '20px',
  },
  pageTab: {
    flex: 1,
    minHeight: '48px',
    padding: '12px 8px',
    fontSize: '14px',
    fontWeight: 600,
    border: 'none',
    borderRadius: theme.radius.sm,
    cursor: 'pointer',
    transition: 'all 0.15s',
    fontFamily: 'inherit',
  },
  pageTabActive: {
    background: theme.colors.surface,
    color: theme.colors.primary,
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  pageTabInactive: {
    background: 'transparent',
    color: theme.colors.textMuted,
  },
  kpiGrid: {
    display: 'grid',
    gap: 12,
    marginBottom: 16,
  },
  kpiCard: { padding: 16, textAlign: 'center' },
  kpiValue: { fontSize: 28, fontWeight: 700 },
  kpiLabel: { fontSize: 13, color: theme.colors.textMuted, marginTop: 4 },
  snapshotCard: { marginBottom: 16, padding: 16 },
  snapshotBlock: { marginBottom: 12 },
  snapshotLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: theme.colors.textMuted,
    marginBottom: 6,
    letterSpacing: '0.02em',
  },
  snapshotList: { listStyle: 'none', margin: 0, padding: 0 },
  snapshotItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    padding: '8px 0',
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  snapshotName: { fontWeight: 600, fontSize: 14 },
  snapshotMeta: { fontSize: 13, color: theme.colors.textMuted, flexShrink: 0 },
  sectionTitle: { margin: '0 0 8px', fontSize: 16, fontWeight: 600 },
  hint: { margin: '0 0 12px', fontSize: 13, color: theme.colors.textMuted },
  input: {
    padding: '8px 12px',
    borderRadius: 8,
    border: `1px solid ${theme.colors.border}`,
    fontSize: 14,
    minWidth: 120,
    minHeight: 44,
  },
  filters: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, alignItems: 'stretch' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'right',
    padding: '8px 10px',
    borderBottom: `2px solid ${theme.colors.border}`,
    color: theme.colors.textMuted,
  },
  td: {
    padding: '10px',
    borderBottom: `1px solid ${theme.colors.border}`,
    verticalAlign: 'top',
  },
  mobileList: { display: 'flex', flexDirection: 'column', gap: 10 },
  eventCard: {
    padding: 14,
    borderRadius: 10,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.background,
  },
  eventCardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  eventName: { fontWeight: 700, fontSize: 15 },
  eventType: { fontSize: 13, fontWeight: 600, color: theme.colors.primary },
  eventMeta: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 10 },
  eventActions: { display: 'flex', justifyContent: 'flex-start' },
}
