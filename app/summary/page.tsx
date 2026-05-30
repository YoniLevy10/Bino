'use client'

/**
 * דף סיכום – דוחות וניתוחים עסקיים לבעל העסק.
 *
 * מציג: KPI חודשי (תקלות, דיירים, עובדים), גרף עמודות לפי שבוע,
 * טבלת ביצועים לפי פרויקט, ויצוא Excel מלא.
 *
 * סינון: חודש, פרויקט, סטטוס.
 *
 * פעולות:
 *  - "יצוא Excel" → xlsx עם נתוני הסיכום
 *  - שינוי חודש/פרויקט → מחשב מחדש את הדוח
 */
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { resolveBamakorClientIdForBrowser } from '@/lib/bamakor-client'
import { withClientId } from '@/lib/supabase/with-client-id'
import { shouldSkipStalePageCache } from '@/lib/app-splash-session'
import {
  AppShell,
  MobileHeader,
  MobileMenu,
  PageHeader,
  KpiCard,
  Card,
  Button,
  Select,
  LoadingSpinner,
  theme
} from '../components/ui'

const CACHE_KEY = 'bamakor_summary_v2'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

type SummaryCache = {
  tickets: TicketRow[]
  projects: ProjectRow[]
  workers: WorkerRow[]
  savedAt: number
}

function readSummaryCache(clientId: string): SummaryCache | null {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY}_${clientId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SummaryCache
    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) return null
    return parsed
  } catch { return null }
}

function writeSummaryCache(clientId: string, data: Omit<SummaryCache, 'savedAt'>) {
  try {
    localStorage.setItem(`${CACHE_KEY}_${clientId}`, JSON.stringify({ ...data, savedAt: Date.now() }))
  } catch {}
}

type TicketRow = {
  id: string
  ticket_number: number
  project_id?: string
  project_code?: string
  project_name?: string
  reporter_phone: string
  description: string
  status: string
  priority?: string
  assigned_worker_id: string | null
  created_at: string
  closed_at: string | null
}

type RawTicketRow = {
  id: string
  ticket_number: number
  project_id?: string
  projects?: { project_code?: string; name?: string } | { project_code?: string; name?: string }[]
  reporter_phone: string
  description: string
  status: string
  priority?: string
  assigned_worker_id: string | null
  created_at: string
  closed_at: string | null
}

type ProjectRow = {
  id: string
  name: string
  project_code: string
}

type WorkerRow = {
  id: string
  full_name: string
  phone: string
  is_active: boolean
}

export default function SummaryPage() {
  const router = useRouter()
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [workers, setWorkers] = useState<WorkerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [period, setPeriod] = useState<'week' | 'month' | 'all' | 'custom'>('week')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 900)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const clientId = await resolveBamakorClientIdForBrowser()
      const [
        { data: ticketsData, error: ticketsError },
        { data: projectsData, error: projectsError },
        { data: workersData, error: workersError },
      ] = await Promise.all([
        withClientId(
          supabase.from('tickets').select(`
            id, ticket_number, project_id, reporter_phone, description,
            status, priority, assigned_worker_id, created_at, closed_at,
            projects (project_code, name)
          `),
          clientId
        )
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        withClientId(
          supabase.from('projects').select('id, name, project_code'),
          clientId
        ).order('project_code', { ascending: true }),
        withClientId(
          supabase.from('workers').select('id, full_name, phone, is_active').eq('is_active', true),
          clientId
        ).is('deleted_at', null),
      ])

      if (ticketsError) throw ticketsError
      if (projectsError) throw projectsError
      if (workersError) throw workersError

      const formattedTickets: TicketRow[] = (ticketsData || []).map((row: RawTicketRow) => ({
        id: row.id,
        ticket_number: row.ticket_number,
        project_id: row.project_id,
        project_code: Array.isArray(row.projects) ? row.projects?.[0]?.project_code || '' : row.projects?.project_code || '',
        project_name: Array.isArray(row.projects) ? row.projects?.[0]?.name || '' : row.projects?.name || '',
        reporter_phone: row.reporter_phone,
        description: row.description,
        status: row.status,
        priority: row.priority,
        assigned_worker_id: row.assigned_worker_id,
        created_at: row.created_at,
        closed_at: row.closed_at,
      }))

      const freshProjects = (projectsData as ProjectRow[]) || []
      const freshWorkers = (workersData as WorkerRow[]) || []
      setTickets(formattedTickets)
      setProjects(freshProjects)
      setWorkers(freshWorkers)
      writeSummaryCache(clientId, { tickets: formattedTickets, projects: freshProjects, workers: freshWorkers })
    } catch (err) {
      console.error('Failed to load summary:', err)
    }
    if (!silent) setLoading(false)
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const clientId = await resolveBamakorClientIdForBrowser()
        const cached = shouldSkipStalePageCache() ? null : readSummaryCache(clientId)
        if (cached) {
          setTickets(cached.tickets)
          setProjects(cached.projects)
          setWorkers(cached.workers)
          setLoading(false)
          void loadData(true)
        } else {
          void loadData()
        }
      } catch {
        void loadData()
      }
    })()
  }, [loadData])

  // Visibility API — silent refresh when returning to tab
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadData(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadData])

  function startOfDay(d: Date) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate())
  }

  function clampDateRange(range: { from: Date; toExclusive: Date }) {
    const from = range.from
    const toExclusive = range.toExclusive
    if (!(from instanceof Date) || isNaN(from.getTime())) return null
    if (!(toExclusive instanceof Date) || isNaN(toExclusive.getTime())) return null
    if (toExclusive <= from) return null
    return { from, toExclusive }
  }

  function resolveDateRange(): { label: string; from: Date; toExclusive: Date } | null {
    const now = new Date()
    const today = startOfDay(now)

    if (period === 'all') {
      return { label: 'מתחילת התקופה', from: new Date(0), toExclusive: new Date(now.getTime() + 1) }
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

    // custom
    if (!customFrom || !customTo) return null
    const from = startOfDay(new Date(customFrom))
    const toInclusive = startOfDay(new Date(customTo))
    const toExclusive = new Date(toInclusive.getTime() + 24 * 60 * 60 * 1000)
    const valid = clampDateRange({ from, toExclusive })
    if (!valid) return null
    return {
      label: `מותאם אישית (${from.toLocaleDateString('he-IL')}–${toInclusive.toLocaleDateString('he-IL')})`,
      from: valid.from,
      toExclusive: valid.toExclusive,
    }
  }

  const activeRange = useMemo(() => resolveDateRange(), [period, customFrom, customTo])

  const ticketsInRange = useMemo(() => {
    if (!activeRange) return []
    return tickets.filter((t) => {
      const createdAt = new Date(t.created_at)
      return createdAt >= activeRange.from && createdAt < activeRange.toExclusive
    })
  }, [tickets, activeRange])

  const closedInRangeCount = useMemo(() => {
    if (!activeRange) return 0
    return tickets.filter((t) => {
      if (!t.closed_at) return false
      const closedAt = new Date(t.closed_at)
      return closedAt >= activeRange.from && closedAt < activeRange.toExclusive
    }).length
  }, [tickets, activeRange])

  const summary = useMemo(() => {
    const openNow = tickets.filter((t) => t.status === 'NEW').length
    const assignedNow = tickets.filter((t) => t.status === 'ASSIGNED' || t.status === 'IN_PROGRESS').length

    return {
      openedInRange: ticketsInRange.length,
      closedInRange: closedInRangeCount,
      openNow,
      assignedNow,
    }
  }, [tickets, ticketsInRange.length, closedInRangeCount])

  const projectStats = useMemo(() => {
    const sourceTickets = activeRange ? ticketsInRange : tickets
    return projects
      .map((project) => {
        const projectTickets = sourceTickets.filter(
          (t) =>
            (t.project_id && t.project_id === project.id) ||
            (!!t.project_code && t.project_code === project.project_code)
        )
        return {
          id: project.id,
          name: project.name,
          project_code: project.project_code,
          total: projectTickets.length,
          open: projectTickets.filter((t) => t.status === 'NEW').length,
          assigned: projectTickets.filter((t) => t.status === 'ASSIGNED' || t.status === 'IN_PROGRESS').length,
          closed: projectTickets.filter((t) => t.status === 'CLOSED').length,
        }
      })
      .sort((a, b) => b.total - a.total)
  }, [projects, tickets, ticketsInRange, activeRange])

  const workerLoad = useMemo(() => {
    const sourceTickets = activeRange ? ticketsInRange : tickets
    return workers
      .map((worker) => {
        const assignedTickets = sourceTickets.filter(
          (t) => t.assigned_worker_id === worker.id && t.status !== 'CLOSED'
        ).length
        return {
          id: worker.id,
          full_name: worker.full_name,
          assigned_tickets: assignedTickets,
        }
      })
      .filter((w) => w.assigned_tickets > 0)
      .sort((a, b) => b.assigned_tickets - a.assigned_tickets)
  }, [workers, tickets, ticketsInRange, activeRange])

  const projectsRequiringAttention = useMemo(() => {
    return projectStats
      .filter((p) => p.open > 0 || p.assigned > 0)
      .sort((a, b) => (b.open + b.assigned) - (a.open + a.assigned))
      .slice(0, 6)
  }, [projectStats])

  function navigateToTickets(filter?: { status?: string; project?: string; worker?: string }) {
    let url = '/tickets'
    if (filter) {
      const params = new URLSearchParams()
      if (filter.status) params.append('status', filter.status)
      if (filter.project) params.append('project', filter.project)
      if (filter.worker) params.append('worker', filter.worker)
      if (params.toString()) url += `?${params.toString()}`
    }
    router.push(url)
  }

  function formatDate() {
    return new Date().toLocaleDateString('he-IL', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  async function exportSummaryToExcel() {
    const { XLSXStyle: XLSX, applyHeaderStyle, applyDataStyles } = await import('@/lib/excel-style')
    const range = activeRange
    if (!range) return

    const kpiRows = [
      { מדד: 'פתוחות כעת', ערך: summary.openNow },
      { מדד: 'בטיפול כעת', ערך: summary.assignedNow },
      { מדד: `נפתחו (${range.label})`, ערך: summary.openedInRange },
      { מדד: `נסגרו (${range.label})`, ערך: summary.closedInRange },
    ]

    const projectRows = projectStats.map((p) => ({
      פרויקט: p.name,
      'סה״כ תקלות': p.total,
      פתוחות: p.open,
      בטיפול: p.assigned,
      נסגרו: p.closed,
    }))

    const workerRows = workerLoad.map((w) => ({
      עובד: w.full_name,
      'תקלות פעילות': w.assigned_tickets,
    }))

    const wsKpi = XLSX.utils.json_to_sheet(kpiRows)
    wsKpi['!cols'] = [{ wch: 28 }, { wch: 12 }]
    wsKpi['!freeze'] = { xSplit: 0, ySplit: 1 }
    wsKpi['!autofilter'] = { ref: wsKpi['!ref'] as string }
    applyHeaderStyle(wsKpi, 2)
    applyDataStyles(wsKpi, kpiRows.length, 2)

    const wsProjects = XLSX.utils.json_to_sheet(projectRows)
    wsProjects['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]
    wsProjects['!freeze'] = { xSplit: 0, ySplit: 1 }
    wsProjects['!autofilter'] = { ref: wsProjects['!ref'] as string }
    applyHeaderStyle(wsProjects, 5)
    applyDataStyles(wsProjects, projectRows.length, 5)

    const wsWorkers = XLSX.utils.json_to_sheet(workerRows)
    wsWorkers['!cols'] = [{ wch: 24 }, { wch: 16 }]
    wsWorkers['!freeze'] = { xSplit: 0, ySplit: 1 }
    wsWorkers['!autofilter'] = { ref: wsWorkers['!ref'] as string }
    applyHeaderStyle(wsWorkers, 2)
    applyDataStyles(wsWorkers, workerRows.length, 2)

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ טווח: range.label, הופק_בתאריך: new Date().toLocaleString('he-IL') }]), 'Meta')
    XLSX.utils.book_append_sheet(wb, wsKpi, 'KPIs')
    XLSX.utils.book_append_sheet(wb, wsProjects, 'Projects')
    XLSX.utils.book_append_sheet(wb, wsWorkers, 'Workers')

    const safeName =
      period === 'custom'
        ? `summary-custom-${customFrom || 'from'}-${customTo || 'to'}`
        : `summary-${period}`
    XLSX.writeFile(wb, `${safeName}.xlsx`)
  }

  return (
    <AppShell isMobile={isMobile}>
      {isMobile && (
        <MobileHeader
          title="סיכום"
          subtitle={formatDate()}
          subtitleSuppressHydrationWarning
          onMenuClick={() => setMenuOpen(true)}
        />
      )}

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div style={styles.content}>
        {!isMobile && (
          <PageHeader
            title="סיכום"
            subtitle="סקירה תפעולית ומדדי ביצוע"
            actions={
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <Select
                  value={period}
                  onChange={(value) => setPeriod(value as 'week' | 'month' | 'all' | 'custom')}
                  options={[
                    { label: 'השבוע', value: 'week' },
                    { label: 'החודש', value: 'month' },
                    { label: 'מתחילת התקופה', value: 'all' },
                    { label: 'התאמה אישית', value: 'custom' },
                  ]}
                />
                <Button
                  variant="secondary"
                  type="button"
                  disabled={!activeRange}
                  onClick={exportSummaryToExcel}
                >
                  ייצוא ל-Excel
                </Button>
              </div>
            }
          />
        )}
        {isMobile && (
          <div style={{ marginBottom: '24px', marginTop: '-8px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <Select
                value={period}
                onChange={(value) => setPeriod(value as 'week' | 'month' | 'all' | 'custom')}
                options={[
                  { label: 'השבוע', value: 'week' },
                  { label: 'החודש', value: 'month' },
                  { label: 'מתחילת התקופה', value: 'all' },
                  { label: 'התאמה אישית', value: 'custom' },
                ]}
                style={{ width: '100%', maxWidth: '360px' }}
              />
              <Button
                variant="secondary"
                type="button"
                disabled={!activeRange}
                onClick={exportSummaryToExcel}
              >
                ייצוא ל-Excel
              </Button>
            </div>
          </div>
        )}

        {period === 'custom' && (
          <Card style={{ marginBottom: '24px' }}>
            <div style={styles.dateRow}>
              <div style={styles.dateField}>
                <label style={styles.dateLabel}>מתאריך</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  style={styles.dateInput}
                />
              </div>
              <div style={styles.dateField}>
                <label style={styles.dateLabel}>עד תאריך</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  style={styles.dateInput}
                />
              </div>
              {!activeRange && (
                <div style={styles.dateHint}>בחרו טווח תאריכים תקין (עד תאריך חייב להיות אחרי מתאריך)</div>
              )}
            </div>
          </Card>
        )}

        {loading ? (
          <div style={styles.loadingContainer}>
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div style={{
              ...styles.kpiGrid,
              gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            }}>
              <KpiCard
                label="פתוחות כעת"
                value={summary.openNow}
                accent="warning"
                onClick={() => navigateToTickets({ status: 'NEW' })}
              />
              <KpiCard
                label="בטיפול"
                value={summary.assignedNow}
                accent="primary"
                onClick={() => navigateToTickets({ status: 'ASSIGNED' })}
              />
              <KpiCard
                label={activeRange ? `נפתחו (${activeRange.label})` : 'נפתחו'}
                value={summary.openedInRange}
                accent="primary"
                onClick={() => navigateToTickets()}
              />
              <KpiCard
                label={activeRange ? `נסגרו (${activeRange.label})` : 'נסגרו'}
                value={summary.closedInRange}
                accent="success"
              />
            </div>

            {/* System Health */}
            <Card title="בריאות המערכת" subtitle="מדדי ביצוע מרכזיים">
              <div style={styles.metricsGrid}>
                <div style={styles.metricCard}>
                  <div style={styles.metricValue}>
                    {summary.openedInRange > 0
                      ? `${Math.round((summary.closedInRange / summary.openedInRange) * 100)}%`
                      : '—'}
                  </div>
                  <div style={styles.metricLabel}>
                    אחוז סגירה ({activeRange ? activeRange.label : 'טווח'})
                  </div>
                  <div style={styles.metricDescription}>
                    {summary.closedInRange} מתוך {summary.openedInRange} נסגרו
                  </div>
                </div>

                <div style={styles.metricCard}>
                  <div style={styles.metricValue}>{summary.openNow}</div>
                  <div style={styles.metricLabel}>ממתינות לשיוך</div>
                  <div style={styles.metricDescription}>
                    תקלות ממתינות לעובד
                  </div>
                </div>

                <div style={styles.metricCard}>
                  <div style={styles.metricValue}>{workerLoad.length}</div>
                  <div style={styles.metricLabel}>עובדים פעילים</div>
                  <div style={styles.metricDescription}>
                    עם משימות משויכות
                  </div>
                </div>

                <div style={styles.metricCard}>
                  <div style={styles.metricValue}>
                    {Math.max(0, projectStats.length - projectsRequiringAttention.length)}
                  </div>
                  <div style={styles.metricLabel}>פרויקטים תקינים</div>
                  <div style={styles.metricDescription}>
                    אין תקלות פתוחות
                  </div>
                </div>
              </div>
            </Card>

            {/* Two Column Layout */}
            <div style={{
              ...styles.twoColumnGrid,
              gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            }}>
              {/* Top Priority Projects */}
              <Card title="פרויקטים עם עומס גבוה" subtitle="עומס תקלות גבוה ביותר">
                {projectsRequiringAttention.length === 0 ? (
                  <div style={styles.emptyState}>
                    <div style={styles.emptyIcon}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={theme.colors.success} strokeWidth="2">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </div>
                    <div style={styles.emptyTitle}>הכל נקי</div>
                    <div style={styles.emptyText}>אין פרויקטים עם תקלות ממתינות</div>
                  </div>
                ) : (
                  <div style={styles.priorityList}>
                    {projectsRequiringAttention.map((project, idx) => (
                      <div
                        key={project.id}
                        style={styles.priorityItem}
                        onClick={() => navigateToTickets({ project: project.project_code })}
                      >
                        <div style={styles.priorityRank}>{idx + 1}</div>
                        <div style={styles.priorityInfo}>
                          <div style={styles.priorityName}>{project.name}</div>
                        </div>
                        <div style={styles.priorityStats}>
                          <span style={styles.priorityOpen}>{project.open} פתוחות</span>
                          <span style={styles.priorityAssigned}>{project.assigned} בטיפול</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Team Capacity */}
              <Card title="עומס צוות" subtitle="התפלגות עומס עובדים" style={{ overflow: 'visible' }}>
                {workerLoad.length === 0 ? (
                  <div style={styles.emptyState}>
                    <div style={styles.emptyIcon}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textMuted} strokeWidth="2">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                      </svg>
                    </div>
                    <div style={styles.emptyTitle}>אין שיבוצים פעילים</div>
                    <div style={styles.emptyText}>כל העובדים זמינים כרגע</div>
                  </div>
                ) : (
                  <div style={styles.workerList}>
                    {workerLoad.slice(0, 6).map((worker) => {
                      const maxLoad = Math.max(...workerLoad.map((w) => w.assigned_tickets))
                      const loadPercent = (worker.assigned_tickets / (maxLoad || 1)) * 100
                      const isHighLoad = loadPercent > 70

                      return (
                        <div
                          key={worker.id}
                          style={styles.workerItem}
                          onClick={() => navigateToTickets({ worker: worker.id })}
                        >
                          <div style={styles.workerItemRow}>
                            <div style={styles.workerName}>{worker.full_name}</div>
                            <div style={{
                              ...styles.workerCount,
                              color: isHighLoad ? theme.colors.error : theme.colors.textMuted,
                            }}>
                              {worker.assigned_tickets} {isHighLoad ? '(עומס גבוה)' : 'פעיל'}
                            </div>
                          </div>
                          <div style={styles.workerBarContainer}>
                            <div style={styles.workerBarBg}>
                              <div
                                style={{
                                  ...styles.workerBarFill,
                                  width: `${loadPercent}%`,
                                  background: isHighLoad ? theme.colors.error : theme.colors.success,
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </Card>
            </div>

            {/* Projects Performance Table */}
            <Card title="ביצועי פרויקטים" subtitle="נפח תקלות לפי פרויקט" noPadding>
              {projectStats.length === 0 ? (
                <div style={styles.emptyTableState}>
                  <p style={styles.emptyText}>לא נמצאו נתוני פרויקטים</p>
                </div>
              ) : (
                <div style={styles.tableContainer}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>פרויקט</th>
                        <th style={styles.th}>סה״כ</th>
                        <th style={styles.th}>פתוחות</th>
                        <th style={styles.th}>בטיפול</th>
                        <th style={styles.th}>נסגרו</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectStats.slice(0, 10).map((project) => (
                        <tr
                          key={project.id}
                          style={styles.tr}
                          onClick={() => navigateToTickets({ project: project.project_code })}
                        >
                          <td style={styles.td}>
                            <span style={styles.projectName}>{project.name}</span>
                          </td>
                          <td style={styles.td}>{project.total}</td>
                          <td style={styles.td}>
                            <span style={{
                              ...styles.statBadge,
                              color: project.open > 0 ? theme.colors.warning : theme.colors.textMuted,
                            }}>
                              {project.open}
                            </span>
                          </td>
                          <td style={styles.td}>
                            <span style={{
                              ...styles.statBadge,
                              color: project.assigned > 0 ? theme.colors.info : theme.colors.textMuted,
                            }}>
                              {project.assigned}
                            </span>
                          </td>
                          <td style={styles.td}>
                            <span style={{
                              ...styles.statBadge,
                              color: theme.colors.success,
                            }}>
                              {project.closed}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </AppShell>
  )
}

const styles: Record<string, CSSProperties> = {
  content: {
    padding: '32px 40px',
    maxWidth: '1400px',
    margin: '0 auto',
    outline: 'none',
    border: 'none',
    boxSizing: 'border-box',
  },
  dateRow: {
    display: 'flex',
    gap: '16px',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  dateField: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minWidth: '220px',
  },
  dateLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
  },
  dateInput: {
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    fontSize: '14px',
    color: theme.colors.textPrimary,
  },
  dateHint: {
    fontSize: '12px',
    color: theme.colors.textMuted,
    paddingBottom: '6px',
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '80px 0',
  },
  kpiGrid: {
    display: 'grid',
    gap: '16px',
    marginBottom: '24px',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '16px',
  },
  metricCard: {
    padding: '20px',
    background: theme.colors.muted,
    borderRadius: theme.radius.md,
  },
  metricValue: {
    fontSize: '32px',
    fontWeight: 700,
    color: theme.colors.textPrimary,
    letterSpacing: '-0.02em',
  },
  metricLabel: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.colors.textSecondary,
    marginTop: '4px',
  },
  metricDescription: {
    fontSize: '12px',
    color: theme.colors.textMuted,
    marginTop: '4px',
  },
  twoColumnGrid: {
    display: 'grid',
    gap: '24px',
    marginBottom: '24px',
    marginTop: '24px',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    textAlign: 'center',
  },
  emptyIcon: {
    marginBottom: '12px',
    opacity: 0.8,
  },
  emptyTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
  },
  emptyText: {
    fontSize: '14px',
    color: theme.colors.textMuted,
    marginTop: '4px',
  },
  emptyTableState: {
    padding: '48px 24px',
    textAlign: 'center',
  },
  priorityList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  priorityItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '14px',
    background: theme.colors.muted,
    borderRadius: theme.radius.md,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  priorityRank: {
    width: '28px',
    height: '28px',
    borderRadius: theme.radius.full,
    background: theme.colors.primaryMuted,
    color: theme.colors.primary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    fontWeight: 600,
    flexShrink: 0,
  },
  priorityInfo: {
    flex: 1,
    minWidth: 0,
  },
  priorityName: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.colors.textPrimary,
  },
  priorityCode: {
    fontSize: '12px',
    color: theme.colors.textMuted,
  },
  priorityStats: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '2px',
  },
  priorityOpen: {
    fontSize: '12px',
    fontWeight: 500,
    color: theme.colors.warning,
  },
  priorityAssigned: {
    fontSize: '11px',
    color: theme.colors.textMuted,
  },
  workerList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    overflow: 'visible',
    paddingBottom: '8px',
  },
  workerItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    cursor: 'pointer',
    minHeight: '52px',
    overflow: 'visible',
  },
  workerItemRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    width: '100%',
  },
  workerName: {
    fontSize: '14px',
    fontWeight: 500,
    color: theme.colors.textPrimary,
    minWidth: 0,
    flex: 1,
  },
  workerBarContainer: {
    width: '100%',
    minHeight: '8px',
  },
  workerBarBg: {
    height: '6px',
    background: theme.colors.border,
    borderRadius: '3px',
    overflow: 'hidden',
  },
  workerBarFill: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.3s ease',
  },
  workerCount: {
    fontSize: '12px',
    flexShrink: 0,
    textAlign: 'left',
  },
  tableContainer: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'start',
    padding: '14px 20px',
    fontSize: '12px',
    fontWeight: 600,
    color: theme.colors.textMuted,
    textTransform: 'none',
    letterSpacing: '0.02em',
    borderBottom: `1px solid ${theme.colors.border}`,
    background: theme.colors.muted,
  },
  tr: {
    cursor: 'pointer',
    transition: 'background 0.15s ease',
  },
  td: {
    padding: '16px 20px',
    fontSize: '14px',
    color: theme.colors.textPrimary,
    borderBottom: `1px solid ${theme.colors.border}`,
    verticalAlign: 'middle',
  },
  projectName: {
    fontWeight: 500,
  },
  projectCode: {
    fontSize: '12px',
    color: theme.colors.textMuted,
    background: theme.colors.muted,
    padding: '4px 8px',
    borderRadius: theme.radius.sm,
  },
  statBadge: {
    fontWeight: 600,
  },
}
