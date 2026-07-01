'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import {
  AppShell,
  MobileHeader,
  useMobileMenu,
  PageHeader,
  Card,
  Button,
  theme,
} from '../components/ui'
import { PageListSkeleton } from '../components/page-skeleton'
import { PaidAddonGate } from '../components/PaidAddonGate'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { AttendanceHelpSteps } from '../components/attendance/AttendanceHelpSteps'
import { AttendanceShiftsReport } from '../components/attendance/AttendanceShiftsReport'
import { AttendanceTodaySummary } from '../components/attendance/AttendanceTodaySummary'
import { AttendanceSetupChecklist } from '../components/attendance/AttendanceSetupChecklist'
import { AttendanceHelpContact } from '../components/attendance/AttendanceHelpContact'
import { AttendanceLiveWorkers } from '../components/attendance/AttendanceLiveWorkers'
import { AttendanceAnomalies } from '../components/attendance/AttendanceAnomalies'
import { AttendanceStickerProgress } from '../components/attendance/AttendanceStickerProgress'
import { EVENT_TYPE_HE } from '@/lib/attendance-display'

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

export default function AttendancePage() {
  const { openMenu } = useMobileMenu()
  const [events, setEvents] = useState<AttendanceEventRow[]>([])
  const [tagCount, setTagCount] = useState(0)
  const [stickerInstalled, setStickerInstalled] = useState(0)
  const [stickerTotal, setStickerTotal] = useState(0)
  const [kpis, setKpis] = useState({
    active_workers_now: 0,
    clock_ins_today: 0,
    project_visits_today: 0,
    pending_review: 0,
  })
  const [loading, setLoading] = useState(true)
  const [syncFilter, setSyncFilter] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const onStickerProgress = useCallback((installed: number, total: number) => {
    setStickerInstalled(installed)
    setStickerTotal(total)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (syncFilter) params.set('sync_status', syncFilter)
      const [evRes, tagRes] = await Promise.all([
        fetchWithTimeout(`/api/attendance/events?${params.toString()}`),
        fetchWithTimeout('/api/attendance/tags'),
      ])
      const evBody = (await evRes.json().catch(() => ({}))) as {
        events?: AttendanceEventRow[]
        kpis?: typeof kpis
        error?: string
      }
      if (!evRes.ok) throw new Error(evBody.error || 'טעינה נכשלה')
      setEvents(evBody.events ?? [])
      if (evBody.kpis) setKpis(evBody.kpis)

      const tagBody = (await tagRes.json().catch(() => ({}))) as { tags?: unknown[] }
      if (tagRes.ok) setTagCount((tagBody.tags ?? []).length)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינה נכשלה')
    } finally {
      setLoading(false)
    }
  }, [syncFilter])

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

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

  const inner = (
    <>
      {!isMobile && (
        <PageHeader title="חתמת עובדים" subtitle="מעקב שעות עובדי שטח — מדבקות NFC" />
      )}

      <AttendanceHelpSteps />
      <AttendanceHelpContact />

      <AttendanceSetupChecklist
        tagCount={tagCount}
        stickerInstalled={stickerInstalled}
        stickerTotal={stickerTotal}
      />

      <AttendanceStickerProgress onProgress={onStickerProgress} />

      {kpis.pending_review > 0 ? (
        <Card style={{ marginBottom: 16, borderColor: theme.colors.warning, background: theme.colors.warningMuted }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
            יש {kpis.pending_review} החתמות שדורשות את תשומת לבך — גללו למטה ולחצו «אשר».
          </p>
        </Card>
      ) : null}

      <AttendanceAnomalies />
      <AttendanceTodaySummary />
      <AttendanceLiveWorkers />

      <div style={styles.kpiGrid}>
        <Card style={styles.kpiCard}>
          <div style={styles.kpiValue}>{kpis.active_workers_now}</div>
          <div style={styles.kpiLabel}>עובדים בדרך עכשיו</div>
        </Card>
        <Card style={styles.kpiCard}>
          <div style={styles.kpiValue}>{kpis.clock_ins_today}</div>
          <div style={styles.kpiLabel}>נכנסו היום</div>
        </Card>
        <Card style={styles.kpiCard}>
          <div style={styles.kpiValue}>{kpis.project_visits_today}</div>
          <div style={styles.kpiLabel}>ביקורים בבניינים היום</div>
        </Card>
      </div>

      <AttendanceShiftsReport />

      <Card>
        <h3 style={styles.sectionTitle}>החתמות אחרונות</h3>
        <p style={styles.hint}>כניסות, יציאות וביקורים — נרשמים אוטומטית מהמדבקות.</p>
        <div style={styles.filters}>
          {kpis.pending_review > 0 ? (
            <select
              style={styles.input}
              value={syncFilter}
              onChange={(e) => setSyncFilter(e.target.value)}
            >
              <option value="">הכל</option>
              <option value="pending_review">רק שדורשות בדיקה</option>
              <option value="synced">תקין</option>
            </select>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            רענון
          </Button>
        </div>

        {loading ? (
          <PageListSkeleton rows={6} />
        ) : events.length === 0 ? (
          <p style={styles.hint}>עדיין אין החתמות — אחרי שהעובדים יצמידו את הטלפון למדבקה, יופיעו כאן.</p>
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
                      {row.sync_status === 'pending_review' ? (
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
    </>
  )

  return (
    <AppShell isMobile={isMobile}>
      <PaidAddonGate addonKey={PAID_ADDON_KEYS.worker_stamp}>
        {isMobile && (
          <MobileHeader
            title="חתמת עובדים"
            subtitle="נוכחות ומשמרות"
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
          {inner}
        </div>
      </PaidAddonGate>
    </AppShell>
  )
}

const styles: Record<string, CSSProperties> = {
  kpiGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 12,
    marginBottom: 16,
  },
  kpiCard: { padding: 16, textAlign: 'center' },
  kpiValue: { fontSize: 28, fontWeight: 700, color: theme.colors.textPrimary },
  kpiLabel: { fontSize: 13, color: theme.colors.textMuted, marginTop: 4 },
  sectionTitle: { margin: '0 0 8px', fontSize: 16, fontWeight: 600 },
  hint: { margin: '0 0 12px', fontSize: 13, color: theme.colors.textMuted },
  input: {
    padding: '8px 12px',
    borderRadius: 8,
    border: `1px solid ${theme.colors.border}`,
    fontSize: 14,
    minWidth: 120,
  },
  filters: { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
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
}
