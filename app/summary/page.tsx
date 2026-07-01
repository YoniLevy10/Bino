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
 *  - "יצוא Excel" → xlsx עם KPI, סיכום פרויקטים, תקלות לפי פרויקט, ועומס עובדים
 *  - כפתור Excel בשורת פרויקט → קובץ תקלות לפרויקט בלבד
 *  - שינוי חודש/פרויקט → מחשב מחדש את הדוח
 */
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { resolveBamakorClientIdForBrowser } from '@/lib/bamakor-client'
import { withClientId } from '@/lib/supabase/with-client-id'
import { shouldSkipStalePageCache } from '@/lib/app-splash-session'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { isTicketInTreatment, ticketStatusLabelHe } from '@/lib/ticket-status'
import { toast } from '@/lib/error-handler'
import { TM } from '@/lib/toast-messages'
import { downloadExcelWorkbook } from '@/lib/excel-download'
import {
  AppShell,
  MobileHeader,
  MobileMenu,
  PageHeader,
  KpiCard,
  Card,
  Button,
  Select,
  SearchInput,
  EmptyState,
  PriorityDot,
  LoadingSpinner,
  theme
} from '../components/ui'
import { downloadClosedTicketsExcel } from '@/lib/closed-tickets-excel'
import { PageListSkeleton } from '../components/page-skeleton'

const CACHE_KEY = 'bamakor_summary_v2'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const HISTORY_DISPLAY_LIMIT = 500

type PageTab = 'summary' | 'history'

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
  reporter_name?: string | null
  description: string
  status: string
  priority?: string
  assigned_worker_id: string | null
  building_number?: string | null
  created_at: string
  closed_at: string | null
}

type RawTicketRow = {
  id: string
  ticket_number: number
  project_id?: string
  projects?: { project_code?: string; name?: string } | { project_code?: string; name?: string }[]
  reporter_phone: string
  reporter_name?: string | null
  description: string
  status: string
  priority?: string
  assigned_worker_id: string | null
  building_number?: string | null
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

type HistoryProjectGroup = {
  projectId: string
  projectName: string
  projectCode: string
  tickets: TicketRow[]
}

export default function SummaryPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [workers, setWorkers] = useState<WorkerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [period, setPeriod] = useState<'week' | 'month' | 'all' | 'custom'>('week')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [exporting, setExporting] = useState(false)
  const [pageTab, setPageTab] = useState<PageTab>('summary')
  const [historySearchTerm, setHistorySearchTerm] = useState('')
  const [historyProjectFilter, setHistoryProjectFilter] = useState('ALL')
  const [exportingHistoryProjectId, setExportingHistoryProjectId] = useState<string | null>(null)
  const [exportingAllHistory, setExportingAllHistory] = useState(false)

  useEffect(() => {
    if (searchParams.get('tab') === 'history') setPageTab('history')
    const project = searchParams.get('project')
    if (project) setHistoryProjectFilter(decodeURIComponent(project))
  }, [searchParams])

  useEffect(() => {
    if (typeof window === 'undefined') return
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
            id, ticket_number, project_id, reporter_phone, reporter_name, description,
            status, priority, assigned_worker_id, building_number, created_at, closed_at,
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
        reporter_name: row.reporter_name,
        description: row.description,
        building_number: row.building_number,
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
      const createdInRange =
        t.created_at &&
        new Date(t.created_at) >= activeRange.from &&
        new Date(t.created_at) < activeRange.toExclusive
      const closedInRange =
        t.closed_at &&
        new Date(t.closed_at) >= activeRange.from &&
        new Date(t.closed_at) < activeRange.toExclusive
      return Boolean(createdInRange || closedInRange)
    })
  }, [tickets, activeRange])

  const closedTicketsInRange = useMemo(() => {
    if (!activeRange) return []
    return tickets
      .filter((t) => {
        if (!t.closed_at || t.status !== 'CLOSED') return false
        const closedAt = new Date(t.closed_at)
        return closedAt >= activeRange.from && closedAt < activeRange.toExclusive
      })
      .sort((a, b) => new Date(b.closed_at || 0).getTime() - new Date(a.closed_at || 0).getTime())
  }, [tickets, activeRange])

  const historyRange = activeRange

  const historyClosedTickets = closedTicketsInRange

  const historyTruncated = historyClosedTickets.length > HISTORY_DISPLAY_LIMIT

  const historyProjectOptions = useMemo(() => {
    return [
      { label: 'כל הפרויקטים', value: 'ALL' },
      ...projects.map((p) => ({ label: p.name, value: p.project_code })),
    ]
  }, [projects])

  const filteredHistoryTickets = useMemo(() => {
    const capped = historyClosedTickets.slice(0, HISTORY_DISPLAY_LIMIT)
    return capped.filter((ticket) => {
      const q = historySearchTerm.trim().toLowerCase()
      const matchesSearch =
        !q ||
        String(ticket.ticket_number).includes(q) ||
        (ticket.project_code || '').toLowerCase().includes(q) ||
        (ticket.project_name || '').toLowerCase().includes(q) ||
        (ticket.description || '').toLowerCase().includes(q) ||
        (ticket.reporter_phone || '').toLowerCase().includes(q) ||
        (ticket.reporter_name || '').toLowerCase().includes(q)

      const matchesProject =
        historyProjectFilter === 'ALL' || ticket.project_code === historyProjectFilter

      return matchesSearch && matchesProject
    })
  }, [historyClosedTickets, historySearchTerm, historyProjectFilter])

  const historyByProject = useMemo((): HistoryProjectGroup[] => {
    const map = new Map<string, HistoryProjectGroup>()
    for (const ticket of filteredHistoryTickets) {
      const projectId = ticket.project_id || ticket.project_code || 'unknown'
      const existing = map.get(projectId)
      if (existing) {
        existing.tickets.push(ticket)
      } else {
        map.set(projectId, {
          projectId,
          projectName: ticket.project_name || ticket.project_code || 'ללא פרויקט',
          projectCode: ticket.project_code || '',
          tickets: [ticket],
        })
      }
    }
    return [...map.values()].sort((a, b) => a.projectName.localeCompare(b.projectName, 'he'))
  }, [filteredHistoryTickets])

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
    const assignedNow = tickets.filter((t) => isTicketInTreatment(t.status)).length

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
          assigned: projectTickets.filter((t) => isTicketInTreatment(t.status)).length,
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

  const workerNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const worker of workers) map.set(worker.id, worker.full_name)
    return map
  }, [workers])

  const sourceTicketsForExport = useMemo(() => {
    return activeRange ? ticketsInRange : tickets
  }, [activeRange, ticketsInRange, tickets])

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

  function buildTicketExportRows(list: TicketRow[]) {
    return list.map((t) => ({
      פרויקט: t.project_name || t.project_code || '',
      'קוד פרויקט': t.project_code || '',
      '#': t.ticket_number,
      'תאריך פתיחה': t.created_at ? new Date(t.created_at).toLocaleString('he-IL') : '',
      'תאריך סגירה': t.closed_at ? new Date(t.closed_at).toLocaleString('he-IL') : '',
      'טלפון מדווח': t.reporter_phone || '',
      תיאור: t.description || '',
      סטטוס: ticketStatusLabelHe(t.status),
      עדיפות: t.priority || '',
      עובד: t.assigned_worker_id ? workerNameById.get(t.assigned_worker_id) || '' : '',
    }))
  }

  function exportFilenameSuffix() {
    return period === 'custom'
      ? `custom-${customFrom || 'from'}-${customTo || 'to'}`
      : period
  }

  async function exportProjectToExcel(project: {
    id: string
    name: string
    project_code: string
    total: number
  }) {
    const range = activeRange
    if (!range) return

    setExporting(true)
    try {
      const { XLSXStyle: XLSX, applyHeaderStyle, applyDataStyles } = await import('@/lib/excel-style')
      const projectTickets = sourceTicketsForExport
        .filter(
          (t) =>
            (t.project_id && t.project_id === project.id) ||
            (!!t.project_code && t.project_code === project.project_code)
        )
        .sort((a, b) => b.ticket_number - a.ticket_number)

      const ticketRows = buildTicketExportRows(projectTickets)
      const wsTickets = XLSX.utils.json_to_sheet(ticketRows)
      wsTickets['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 6 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 42 }, { wch: 12 }, { wch: 10 }, { wch: 18 }]
      wsTickets['!freeze'] = { xSplit: 0, ySplit: 1 }
      if (wsTickets['!ref']) wsTickets['!autofilter'] = { ref: wsTickets['!ref'] as string }
      applyHeaderStyle(wsTickets, 10)
      applyDataStyles(wsTickets, ticketRows.length, 10)

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet([
          {
            פרויקט: project.name,
            קוד: project.project_code,
            טווח: range.label,
            הופק_בתאריך: new Date().toLocaleString('he-IL'),
          },
        ]),
        'Meta'
      )
      XLSX.utils.book_append_sheet(wb, wsTickets, 'תקלות')

      const { summaryProjectExportFilename } = await import('@/lib/export-filename')
      downloadExcelWorkbook(wb, XLSX, summaryProjectExportFilename(project.name, exportFilenameSuffix()))
      toast.success(TM.excelExported)
    } catch (err) {
      console.error('Project Excel export failed:', err)
      toast.error('ייצוא Excel נכשל')
    } finally {
      setExporting(false)
    }
  }

  async function exportProjectHistoryTickets(group: HistoryProjectGroup) {
    setExportingHistoryProjectId(group.projectId)
    try {
      await downloadClosedTicketsExcel({
        tickets: group.tickets,
        projectName: group.projectName,
      })
      toast.success(TM.excelExported)
    } catch {
      toast.error('ייצוא היסטוריה נכשל')
    }
    setExportingHistoryProjectId(null)
  }

  async function exportAllHistoryTickets() {
    if (filteredHistoryTickets.length === 0) return
    setExportingAllHistory(true)
    try {
      await downloadClosedTicketsExcel({
        tickets: filteredHistoryTickets,
        projectName: historyRange?.label || 'היסטוריה',
        sheetName: 'כל הבניינים',
      })
      toast.success(TM.excelExported)
    } catch {
      toast.error('ייצוא היסטוריה נכשל')
    }
    setExportingAllHistory(false)
  }

  async function exportSummaryToExcel() {
    const range = activeRange
    if (!range) return

    setExporting(true)
    try {
      const { XLSXStyle: XLSX, applyHeaderStyle, applyDataStyles } = await import('@/lib/excel-style')

      const kpiRows = [
        { מדד: 'פתוחות כעת', ערך: summary.openNow },
        { מדד: 'בטיפול כעת', ערך: summary.assignedNow },
        { מדד: `נפתחו (${range.label})`, ערך: summary.openedInRange },
        { מדד: `נסגרו (${range.label})`, ערך: summary.closedInRange },
      ]

      const projectRows = projectStats.map((p) => ({
        פרויקט: p.name,
        'קוד פרויקט': p.project_code,
        'סה״כ תקלות': p.total,
        פתוחות: p.open,
        בטיפול: p.assigned,
        נסגרו: p.closed,
      }))

      const workerRows = workerLoad.map((w) => ({
        עובד: w.full_name,
        'תקלות פעילות': w.assigned_tickets,
      }))

      const ticketRows = buildTicketExportRows(
        [...sourceTicketsForExport].sort((a, b) => {
          const projectCmp = (a.project_name || a.project_code || '').localeCompare(
            b.project_name || b.project_code || '',
            'he'
          )
          if (projectCmp !== 0) return projectCmp
          return b.ticket_number - a.ticket_number
        })
      )

      const wsKpi = XLSX.utils.json_to_sheet(kpiRows)
      wsKpi['!cols'] = [{ wch: 28 }, { wch: 12 }]
      wsKpi['!freeze'] = { xSplit: 0, ySplit: 1 }
      wsKpi['!autofilter'] = { ref: wsKpi['!ref'] as string }
      applyHeaderStyle(wsKpi, 2)
      applyDataStyles(wsKpi, kpiRows.length, 2)

      const wsProjects = XLSX.utils.json_to_sheet(projectRows)
      wsProjects['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]
      wsProjects['!freeze'] = { xSplit: 0, ySplit: 1 }
      wsProjects['!autofilter'] = { ref: wsProjects['!ref'] as string }
      applyHeaderStyle(wsProjects, 6)
      applyDataStyles(wsProjects, projectRows.length, 6)

      const wsTickets = XLSX.utils.json_to_sheet(ticketRows)
      wsTickets['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 6 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 42 }, { wch: 12 }, { wch: 10 }, { wch: 18 }]
      wsTickets['!freeze'] = { xSplit: 0, ySplit: 1 }
      if (wsTickets['!ref']) wsTickets['!autofilter'] = { ref: wsTickets['!ref'] as string }
      applyHeaderStyle(wsTickets, 10)
      applyDataStyles(wsTickets, ticketRows.length, 10)

      const wsWorkers = XLSX.utils.json_to_sheet(workerRows)
      wsWorkers['!cols'] = [{ wch: 24 }, { wch: 16 }]
      wsWorkers['!freeze'] = { xSplit: 0, ySplit: 1 }
      if (wsWorkers['!ref']) wsWorkers['!autofilter'] = { ref: wsWorkers['!ref'] as string }
      applyHeaderStyle(wsWorkers, 2)
      applyDataStyles(wsWorkers, workerRows.length, 2)

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ טווח: range.label, הופק_בתאריך: new Date().toLocaleString('he-IL') }]), 'Meta')
      XLSX.utils.book_append_sheet(wb, wsKpi, 'KPIs')
      XLSX.utils.book_append_sheet(wb, wsProjects, 'Projects')
      XLSX.utils.book_append_sheet(wb, wsTickets, 'תקלות')
      XLSX.utils.book_append_sheet(wb, wsWorkers, 'Workers')

      downloadExcelWorkbook(wb, XLSX, `summary-${exportFilenameSuffix()}.xlsx`)
      toast.success(TM.excelExported)
    } catch (err) {
      console.error('Summary Excel export failed:', err)
      toast.error('ייצוא Excel נכשל')
    } finally {
      setExporting(false)
    }
  }

  return (
    <AppShell isMobile={isMobile}>
      {isMobile && (
        <MobileHeader
          title="סיכום"
          subtitle={
            pageTab === 'history'
              ? `${filteredHistoryTickets.length} סגורות`
              : formatDate()
          }
          subtitleSuppressHydrationWarning={pageTab !== 'history'}
          onMenuClick={() => setMenuOpen(true)}
        />
      )}

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div
        style={{
          ...styles.content,
          ...(isMobile
            ? { padding: '16px 16px 24px', maxWidth: '100%', minWidth: 0, overflowX: 'hidden' }
            : {}),
        }}
      >
        {!isMobile && (
          <PageHeader
            title="סיכום"
            subtitle={
              pageTab === 'history'
                ? 'היסטוריית תקלות סגורות לפי בניין'
                : 'סקירה תפעולית ומדדי ביצוע'
            }
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
                {pageTab === 'summary' && (
                  <Button
                    variant="secondary"
                    type="button"
                    disabled={!activeRange || exporting}
                    loading={exporting}
                    onClick={() => void exportSummaryToExcel()}
                  >
                    ייצוא ל-Excel
                  </Button>
                )}
              </div>
            }
          />
        )}
        {isMobile && (
          <div style={{ marginBottom: '16px' }}>
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
                style={{ width: '100%' }}
              />
              {pageTab === 'summary' && (
                <Button
                  variant="secondary"
                  type="button"
                  disabled={!activeRange || exporting}
                  loading={exporting}
                  onClick={() => void exportSummaryToExcel()}
                  style={{ width: '100%', minHeight: '48px' }}
                >
                  ייצוא ל-Excel
                </Button>
              )}
            </div>
          </div>
        )}

        <div style={styles.pageTabBar}>
          <button
            type="button"
            onClick={() => setPageTab('summary')}
            style={{
              ...styles.pageTab,
              ...(pageTab === 'summary' ? styles.pageTabActive : styles.pageTabInactive),
            }}
          >
            סיכום
          </button>
          <button
            type="button"
            onClick={() => setPageTab('history')}
            style={{
              ...styles.pageTab,
              ...(pageTab === 'history' ? styles.pageTabActive : styles.pageTabInactive),
            }}
          >
            היסטוריה ({historyClosedTickets.length})
          </button>
        </div>

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
            <PageListSkeleton rows={isMobile ? 6 : 8} />
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
              <LoadingSpinner size="lg" />
            </div>
          </div>
        ) : pageTab === 'history' ? (
          <Card noPadding>
            <div
              style={{
                ...styles.historyFiltersRow,
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'stretch' : 'center',
              }}
            >
              <SearchInput
                value={historySearchTerm}
                onChange={setHistorySearchTerm}
                placeholder="חיפוש בהיסטוריה..."
                style={{ flex: 1, maxWidth: isMobile ? 'none' : '280px', width: isMobile ? '100%' : undefined }}
              />
              <Select
                value={historyProjectFilter}
                onChange={setHistoryProjectFilter}
                options={historyProjectOptions}
                style={{ minWidth: isMobile ? '100%' : '160px' }}
              />
              {!isMobile && (
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  disabled={filteredHistoryTickets.length === 0}
                  loading={exportingAllHistory}
                  onClick={() => void exportAllHistoryTickets()}
                  style={{ minHeight: '48px', flexShrink: 0 }}
                >
                  ייצוא הכל
                </Button>
              )}
            </div>

            {isMobile && (
              <div style={{ padding: '0 16px 12px' }}>
                <Button
                  variant="secondary"
                  type="button"
                  disabled={filteredHistoryTickets.length === 0}
                  loading={exportingAllHistory}
                  onClick={() => void exportAllHistoryTickets()}
                  style={{ width: '100%', minHeight: '48px' }}
                >
                  ייצוא הכל ({filteredHistoryTickets.length})
                </Button>
              </div>
            )}

            {historyRange && (
              <p style={styles.historyRangeHint}>
                טווח: {historyRange.label}
              </p>
            )}

            {historyTruncated && (
              <div style={styles.historyTruncationBanner}>
                מציג עד {HISTORY_DISPLAY_LIMIT} תקלות סגורות בטווח שנבחר. לדוח מלא — ייצוא לפי בניין או ייצוא הכל.
              </div>
            )}

            {!historyRange ? (
              <EmptyState
                title="בחרו טווח תאריכים"
                description="הגדירו טווח בחלק העליון כדי לצפות בהיסטוריית תקלות סגורות."
              />
            ) : historyByProject.length === 0 ? (
              <EmptyState
                title="אין תקלות סגורות"
                description="נסו לשנות את התקופה, החיפוש או מסנן הפרויקט."
              />
            ) : (
              <div style={styles.historyGroups}>
                {historyByProject.map((group) => (
                  <div key={group.projectId} style={styles.historyGroup}>
                    <div style={styles.historyGroupHeader}>
                      <div>
                        <h3 style={styles.historyGroupTitle}>{group.projectName}</h3>
                        <p style={styles.historyGroupMeta}>
                          {group.tickets.length} תקלות סגורות
                          {group.projectCode ? ` · ${group.projectCode}` : ''}
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={exportingHistoryProjectId === group.projectId}
                        onClick={() => void exportProjectHistoryTickets(group)}
                        style={{ minHeight: '48px' }}
                      >
                        ייצוא
                      </Button>
                    </div>
                    {isMobile ? (
                      <div style={styles.historyMobileList}>
                        {group.tickets.map((ticket) => (
                          <div key={ticket.id} style={styles.historyTicketCard}>
                            <div style={styles.historyTicketTop}>
                              <span style={styles.historyTicketNumber}>#{ticket.ticket_number}</span>
                              <span style={styles.historyClosedAt}>
                                {ticket.closed_at
                                  ? new Date(ticket.closed_at).toLocaleDateString('he-IL')
                                  : '—'}
                              </span>
                            </div>
                            <p style={styles.historyTicketDesc}>
                              {ticket.description?.slice(0, 120)}
                              {(ticket.description?.length || 0) > 120 ? '…' : ''}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={styles.tableContainer}>
                        <table style={styles.table}>
                          <thead>
                            <tr>
                              <th style={styles.th}>#</th>
                              <th style={styles.th}>תיאור</th>
                              <th style={styles.th}>נסגרה</th>
                              <th style={styles.th}>עדיפות</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.tickets.map((ticket) => (
                              <tr key={ticket.id}>
                                <td style={styles.td}>
                                  <span style={styles.historyTicketNumber}>{ticket.ticket_number}</span>
                                </td>
                                <td style={{ ...styles.td, maxWidth: '420px' }}>
                                  <span style={styles.historyDescText}>
                                    {ticket.description?.slice(0, 100)}
                                    {(ticket.description?.length || 0) > 100 ? '…' : ''}
                                  </span>
                                </td>
                                <td style={styles.td}>
                                  {ticket.closed_at
                                    ? new Date(ticket.closed_at).toLocaleString('he-IL')
                                    : '—'}
                                </td>
                                <td style={styles.td}>
                                  <PriorityDot priority={ticket.priority || 'LOW'} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
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
                onClick={() => setPageTab('history')}
              />
            </div>

            {closedTicketsInRange.length > 0 && (
              <Card
                title="תקלות שנסגרו בטווח"
                subtitle={activeRange ? activeRange.label : ''}
                noPadding
                style={{ marginBottom: '24px' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 16px 16px' }}>
                  {closedTicketsInRange.slice(0, isMobile ? 8 : 12).map((t) => (
                    <div
                      key={t.id}
                      style={{
                        padding: '12px',
                        borderRadius: theme.radius.md,
                        border: `1px solid ${theme.colors.border}`,
                        textAlign: 'right',
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: '14px' }}>
                        #{t.ticket_number} · {t.project_name || t.project_code}
                      </div>
                      <div style={{ fontSize: '13px', color: theme.colors.textSecondary, marginTop: '4px' }}>
                        {t.description?.slice(0, 70)}{(t.description?.length || 0) > 70 ? '…' : ''}
                      </div>
                      <div style={{ fontSize: '12px', color: theme.colors.textMuted, marginTop: '6px' }}>
                        נסגרה: {t.closed_at ? new Date(t.closed_at).toLocaleString('he-IL') : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

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
                        <th style={styles.th}>Excel</th>
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
                          <td style={styles.td} onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="sm"
                              type="button"
                              disabled={!activeRange || exporting}
                              loading={exporting}
                              onClick={() => void exportProjectToExcel(project)}
                            >
                              Excel
                            </Button>
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
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '64px 16px',
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
    maxWidth: '100%',
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
  historyFiltersRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px',
    borderBottom: `1px solid ${theme.colors.border}`,
    flexWrap: 'wrap',
  },
  historyRangeHint: {
    margin: '0 16px 8px',
    fontSize: '13px',
    color: theme.colors.textMuted,
    textAlign: 'right',
  },
  historyTruncationBanner: {
    background: '#FFF4E5',
    border: '1.5px solid #FF9500',
    borderRadius: '10px',
    padding: '10px 16px',
    fontSize: '13px',
    color: '#7D4700',
    margin: '0 16px 12px',
    direction: 'rtl',
  },
  historyGroups: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    padding: '16px',
    maxWidth: '100%',
    boxSizing: 'border-box',
  },
  historyGroup: {
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    background: theme.colors.surface,
  },
  historyGroupHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 20px',
    borderBottom: `1px solid ${theme.colors.border}`,
    background: theme.colors.muted,
    flexWrap: 'wrap',
  },
  historyGroupTitle: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    color: theme.colors.textPrimary,
  },
  historyGroupMeta: {
    margin: '4px 0 0',
    fontSize: '13px',
    color: theme.colors.textMuted,
  },
  historyMobileList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '12px 16px 20px',
  },
  historyTicketCard: {
    padding: '14px 16px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    minHeight: '48px',
  },
  historyTicketTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '6px',
  },
  historyTicketNumber: {
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  historyClosedAt: {
    fontSize: '12px',
    color: theme.colors.textMuted,
  },
  historyTicketDesc: {
    margin: 0,
    fontSize: '14px',
    color: theme.colors.textSecondary,
    lineHeight: 1.45,
  },
  historyDescText: {
    color: theme.colors.textSecondary,
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
}
