'use client'

/**
 * דף הבית – לוח הבקרה הראשי.
 *
 * מציג: כרטיסי KPI (סה"כ תקלות / פתוחות / בטיפול / נסגרו), רשימת תקלות אחרונות,
 * ומאפשר לפתוח תקלה חדשה ולעבור לפרטי תקלה ב-Drawer.
 *
 * ניווט:
 *  - "תקלה חדשה" → פותח AddTicketModal
 *  - לחיצה על שורת תקלה → פותח TicketDetailDrawer
 *  - ניווט בסרגל → /tickets, /projects, /workers, /residents, /qr, /summary, /settings
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { resolveBamakorClientIdForBrowser } from '@/lib/bamakor-client'
import { withClientId } from '@/lib/supabase/with-client-id'
import { toast, asyncHandler, errorMessageFromResponseJson } from '@/lib/error-handler'
import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'
import { TM } from '@/lib/toast-messages'
import { useTicketDetailData } from '@/lib/hooks/use-ticket-detail-data'
import { useTicketDeepLinkOpen } from '@/lib/hooks/use-ticket-deep-link-open'
import type { TicketDetailRow } from '@/lib/ticket-detail-types'
import {
  toastReporterClosedNotifySummary,
  type ReporterClosedNotifyApiBody,
} from '@/lib/reporter-closed-notify-toast'
import { 
  AppShell, 
  MobileHeader, 
  useMobileMenu, 
  KpiCard,
  Card,
  Button,
  StatusBadge,
  ErrorState,
  EmptyState,
  theme 
} from './components/ui'
import type { ProfessionalOption } from './components/tickets/ForwardToProfessionalBlock'

const TicketDetailDrawer = dynamic(
  () => import('./components/tickets/TicketDetailDrawer').then((m) => ({ default: m.TicketDetailDrawer })),
  { loading: () => null }
)
const AddTicketModal = dynamic(
  () => import('./components/tickets/AddTicketModal').then((m) => ({ default: m.AddTicketModal })),
  { loading: () => null }
)
import { PageTransitionLoader } from './components/page-skeleton'
import { ImageLightbox } from './components/shared/ImageLightbox'
import { useIsMobile } from '@/lib/use-is-mobile'
import { removeTicketFromListState } from '@/lib/open-tickets'
import { TicketMobileCard } from './components/tickets/TicketMobileCard'
import { CloseTicketConfirmSheet } from './components/tickets/CloseTicketConfirmSheet'
import { shouldSkipStalePageCache } from '@/lib/app-splash-session'
import { isTicketInTreatment } from '@/lib/ticket-status'
import { useAppRefreshListener } from '@/lib/hooks/use-app-refresh'

type TicketRow = {
  id: string
  ticket_number: number
  project_id?: string
  project_code?: string
  project_name?: string
  client_id?: string | null
  reporter_phone: string
  description: string
  status: string
  priority?: string
  assigned_worker_id: string | null
  created_at: string
  closed_at: string | null
}

type TicketLog = {
  id: string
  ticket_id: string
  action_type: string
  old_value: string | null
  new_value: string | null
  performed_by: string | null
  notes: string | null
  created_at: string
}

function mapFetchedTicketRow(fetched: TicketDetailRow): TicketRow {
  return {
    id: fetched.id,
    ticket_number: fetched.ticket_number,
    project_id: fetched.project_id ?? undefined,
    project_code: fetched.project_code,
    project_name: fetched.project_name,
    client_id: fetched.client_id ?? null,
    reporter_phone: fetched.reporter_phone || '',
    description: fetched.description || '',
    status: fetched.status,
    priority: fetched.priority ?? undefined,
    assigned_worker_id: fetched.assigned_worker_id ?? null,
    created_at: fetched.created_at || '',
    closed_at: fetched.closed_at ?? null,
  }
}
type ProjectRow = {
  id: string
  name: string
  project_code: string
}

type TicketWithProjects = TicketRow & {
  projects?: Array<{ project_code: string; name: string }> | { project_code: string; name: string }
}

const DASHBOARD_CACHE_KEY = 'bamakor_dashboard_v2'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h
const REFRESH_DEBOUNCE_MS = 30_000

type DashboardCache = {
  tickets: TicketRow[]
  projects: ProjectRow[]
  workersMap: Record<string, string>
  closedCount: number
  residentsCount: number | null
  workersCount: number | null
  recentActivity: unknown[]
  savedAt: number
}

function readDashboardCache(): DashboardCache | null {
  try {
    const raw = localStorage.getItem(DASHBOARD_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DashboardCache
    if (Date.now() - parsed.savedAt > CACHE_TTL_MS) return null
    return parsed
  } catch { return null }
}

function writeDashboardCache(data: Omit<DashboardCache, 'savedAt'>) {
  try {
    localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({ ...data, savedAt: Date.now() }))
  } catch { /* storage full or unavailable */ }
}

export default function DashboardPage() {
  const router = useRouter()
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [pageLoadError, setPageLoadError] = useState(false)
  const [workersMap, setWorkersMap] = useState<Record<string, string>>({})
  const [professionals, setProfessionals] = useState<ProfessionalOption[]>([])
  const isMobile = useIsMobile()
  const { openMenu } = useMobileMenu()
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  const [closedCount, setClosedCount] = useState(0)
  const [closeConfirmTicket, setCloseConfirmTicket] = useState<TicketRow | null>(null)

  const [selectedTicket, setSelectedTicket] = useState<TicketRow | null>(null)
  const {
    attachments: selectedTicketAttachments,
    ticketLogs,
    loadingAttachments,
    drawerLoading,
    recoveringMedia,
    loadTicketDrawerData,
    recoverAndReloadAttachments,
    resetTicketDetailData,
  } = useTicketDetailData()
  const [savingTicket, setSavingTicket] = useState(false)
  const [closingTicketId, setClosingTicketId] = useState<string | null>(null)
  const [draftDescription, setDraftDescription] = useState('')
  const [draftStatus, setDraftStatus] = useState('NEW')
  const [draftWorkerId, setDraftWorkerId] = useState('')
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null)

  const [showAddTicketModal, setShowAddTicketModal] = useState(false)
  const [addTicketProjectCode, setAddTicketProjectCode] = useState('')
  const [addTicketDescription, setAddTicketDescription] = useState('')
  const [addTicketReporterName, setAddTicketReporterName] = useState('')
  const [addTicketReporterPhone, setAddTicketReporterPhone] = useState('')
  const [addingTicket, setAddingTicket] = useState(false)
  const [addTicketError, setAddTicketError] = useState('')

  const [activeKpi, setActiveKpi] = useState<'ALL' | 'NEW' | 'IN_PROGRESS'>('ALL')
  const [residentsCount, setResidentsCount] = useState<number | null>(null)
  const [workersCount, setWorkersCount] = useState<number | null>(null)

  type ActivityItem = {
    id: string
    ticket_id: string
    type: 'created' | 'updated' | 'closed'
    ticket_number: number
    project_label: string
    description: string
    time: string
  }

  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([])
  const lastFetchAtRef = useRef(0)
  const professionalsLoadedRef = useRef(false)
  const cacheAuxRef = useRef({
    residentsCount: null as number | null,
    workersCount: null as number | null,
    recentActivity: [] as ActivityItem[],
  })

  const loadProfessionals = useCallback(async () => {
    if (professionalsLoadedRef.current) return
    try {
      const clientId = await resolveBamakorClientIdForBrowser()
      const { data, error } = await withClientId(
        supabase.from('professionals').select('id, full_name, phone, trade, is_active'),
        clientId
      )
        .is('deleted_at', null)
        .order('full_name', { ascending: true })
      if (!error) {
        setProfessionals((data as ProfessionalOption[]) || [])
        professionalsLoadedRef.current = true
      }
    } catch {
      /* non-critical */
    }
  }, [])

  const loadSecondaryData = useCallback(
    async (ctx: {
      tickets: TicketRow[]
      projects: ProjectRow[]
      workersMap: Record<string, string>
      closedCount: number
    }) => {
      try {
        const clientId = await resolveBamakorClientIdForBrowser()
        const [logsResult, resCountResult, wCountResult] = await Promise.all([
        supabase
          .from('ticket_logs')
          .select(
            `
              id, ticket_id, action_type, created_at,
              tickets (
                ticket_number,
                description,
                status,
                projects (name, project_code)
              )
            `
          )
            .order('created_at', { ascending: false })
            .limit(5),
          withClientId(supabase.from('residents').select('id', { count: 'exact', head: true }), clientId).is(
            'deleted_at',
            null
          ),
          withClientId(supabase.from('workers').select('id', { count: 'exact', head: true }), clientId).is(
            'deleted_at',
            null
          ),
        ])

        const resCount = resCountResult.count ?? null
        const wCount = wCountResult.count ?? null
        const fromLogs = buildActivityFromLogs(logsResult.data, logsResult.error)
        const activity =
          fromLogs.length > 0
            ? fromLogs
            : ctx.tickets.slice(0, 5).map((ticket) => ({
                id: ticket.id,
                ticket_id: ticket.id,
                type: (ticket.status === 'NEW' ? 'created' : 'updated') as ActivityItem['type'],
                ticket_number: ticket.ticket_number,
                project_label: ticket.project_name || ticket.project_code || '',
                description: ticket.description,
                time: formatRelativeTime(ticket.created_at),
              }))

        setResidentsCount(resCount)
        setWorkersCount(wCount)
        setRecentActivity(activity)
        cacheAuxRef.current = { residentsCount: resCount, workersCount: wCount, recentActivity: activity }
        writeDashboardCache({
          tickets: ctx.tickets,
          projects: ctx.projects,
          workersMap: ctx.workersMap,
          closedCount: ctx.closedCount,
          residentsCount: resCount,
          workersCount: wCount,
          recentActivity: activity,
        })
      } catch {
        /* non-critical */
      }
    },
    []
  )

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const result = await asyncHandler(
      async () => {
        const clientId = await resolveBamakorClientIdForBrowser()
        const [ticketsResult, closedCountResult, projectsResult, workersResult] = await Promise.all([
          withClientId(
            supabase.from('tickets').select(`
              id, ticket_number, project_id, client_id, reporter_phone, description, 
              status, priority, assigned_worker_id, created_at, closed_at,
              projects (project_code, name)
            `),
            clientId
          )
            .is('deleted_at', null)
            .neq('status', 'CLOSED')
            .order('created_at', { ascending: false })
            .limit(50),
          withClientId(
            supabase.from('tickets').select('id', { count: 'exact', head: true }),
            clientId
          )
            .is('deleted_at', null)
            .eq('status', 'CLOSED'),
          withClientId(
            supabase.from('projects').select('id, name, project_code'),
            clientId
          ).order('project_code', { ascending: true }),
          withClientId(
            supabase.from('workers').select('id, full_name'),
            clientId
          )
            .is('deleted_at', null)
            .order('full_name', { ascending: true }),
        ])

        if (ticketsResult.error) throw ticketsResult.error
        if (projectsResult.error) throw projectsResult.error
        if (workersResult.error) throw workersResult.error

        const formatted: TicketRow[] = (ticketsResult.data || []).map((row: TicketWithProjects) => ({
          id: row.id,
          ticket_number: row.ticket_number,
          project_id: row.project_id,
          client_id: (row as { client_id?: string | null }).client_id ?? null,
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

        const map: Record<string, string> = {}
        workersResult.data?.forEach((worker: { id: string; full_name: string }) => {
          map[worker.id] = worker.full_name
        })

        const nextClosedCount = closedCountResult.count ?? 0
        const nextProjects = projectsResult.data || []
        setTickets(formatted)
        setClosedCount(nextClosedCount)
        setProjects(nextProjects)
        setWorkersMap(map)
        lastFetchAtRef.current = Date.now()

        writeDashboardCache({
          tickets: formatted,
          projects: nextProjects,
          workersMap: map,
          closedCount: nextClosedCount,
          residentsCount: cacheAuxRef.current.residentsCount,
          workersCount: cacheAuxRef.current.workersCount,
          recentActivity: cacheAuxRef.current.recentActivity,
        })

        void loadSecondaryData({
          tickets: formatted,
          projects: nextProjects,
          workersMap: map,
          closedCount: nextClosedCount,
        })

        return true
      },
      { context: 'טעינת הדשבורד', showErrorToast: true }
    )
    setPageLoadError(!result)
    if (!silent) setLoading(false)
  }, [loadSecondaryData])

  const debouncedLoadData = useCallback(
    (silent = false) => {
      if (Date.now() - lastFetchAtRef.current < REFRESH_DEBOUNCE_MS) return
      void loadData(silent)
    },
    [loadData]
  )

  useAppRefreshListener(
    useCallback(() => {
      lastFetchAtRef.current = 0
      void loadData(true)
    }, [loadData])
  )

  useEffect(() => {
    const cached = shouldSkipStalePageCache() ? null : readDashboardCache()
    if (cached) {
      setTickets(cached.tickets)
      setProjects(cached.projects)
      setWorkersMap(cached.workersMap)
      setClosedCount(cached.closedCount ?? 0)
      setResidentsCount(cached.residentsCount)
      setWorkersCount(cached.workersCount)
      setRecentActivity(cached.recentActivity as ActivityItem[])
      cacheAuxRef.current = {
        residentsCount: cached.residentsCount,
        workersCount: cached.workersCount,
        recentActivity: cached.recentActivity as ActivityItem[],
      }
      setLoading(false)
      void loadData(true)
    } else {
      void loadData()
    }
  }, [loadData])

  // Supabase Realtime — silent refresh when DB changes
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-tickets-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        debouncedLoadData(true)
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [debouncedLoadData])

  // Visibility API — silent refresh when returning to tab
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') debouncedLoadData(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [debouncedLoadData])

  function buildActivityFromLogs(
    data: unknown,
    err: { message?: string } | null
  ): ActivityItem[] {
    if (err || !Array.isArray(data)) return []
    const items: ActivityItem[] = []
    for (const row of data) {
      const log = row as {
        id: string
        ticket_id?: string
        action_type?: string | null
        created_at?: string
        tickets?:
          | {
              ticket_number?: number
              description?: string | null
              status?: string
              projects?: { name?: string; project_code?: string } | { name?: string; project_code?: string }[]
            }
          | Array<{
              ticket_number?: number
              description?: string | null
              status?: string
              projects?: { name?: string; project_code?: string } | { name?: string; project_code?: string }[]
            }>
      }
      const rawT = log.tickets
      const ticket = Array.isArray(rawT) ? rawT[0] : rawT
      if (!ticket || !log.created_at || !log.ticket_id) continue
      const proj = ticket.projects
      const p = Array.isArray(proj) ? proj[0] : proj
      const project_label = p?.name || p?.project_code || ''
      const at = (log.action_type || '').toUpperCase()
      let type: ActivityItem['type'] = 'updated'
      if (at.includes('CLOSE') || ticket.status === 'CLOSED') type = 'closed'
      else if (at.includes('CREAT') || at.includes('OPEN') || at.includes('NEW')) type = 'created'
      items.push({
        id: log.id,
        ticket_id: log.ticket_id,
        type,
        ticket_number: ticket.ticket_number ?? 0,
        project_label,
        description: ticket.description || '',
        time: formatRelativeTime(log.created_at),
      })
    }
    return items
  }

  const stats = useMemo(() => {
    const total = tickets.length
    const open = tickets.filter((t) => t.status === 'NEW').length
    const inProgress = tickets.filter((t) => isTicketInTreatment(t.status)).length
    return { total, open, inProgress, closed: closedCount }
  }, [tickets, closedCount])

  const filteredTickets = useMemo(() => {
    let filtered = tickets
    if (activeKpi === 'NEW') filtered = tickets.filter((t) => t.status === 'NEW')
    else if (activeKpi === 'IN_PROGRESS') filtered = tickets.filter((t) => isTicketInTreatment(t.status))
    return filtered.slice(0, isMobile ? 8 : 8)
  }, [tickets, activeKpi, isMobile])

  const projectStats = useMemo(() => {
    return projects.map((project) => {
      const projectTickets = tickets.filter((t) => t.project_code === project.project_code)
      const open = projectTickets.filter((t) => t.status !== 'CLOSED').length
      const total = projectTickets.length
      const progress = total > 0 ? Math.round(((total - open) / total) * 100) : 0
      return { ...project, open, total, progress }
    }).filter(p => p.total > 0).sort((a, b) => b.open - a.open).slice(0, 6)
  }, [projects, tickets])

  function formatRelativeTime(dateString: string) {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)
    if (diffMins < 1) return 'עכשיו'
    if (diffMins < 60) return `לפני ${diffMins} דק׳`
    if (diffHours < 24) return `לפני ${diffHours} שע׳`
    if (diffDays < 7) return `לפני ${diffDays} ימים`
    return date.toLocaleDateString('he-IL', { month: 'short', day: 'numeric' })
  }

  function getGreeting() {
    const hour = new Date().getHours()
    if (hour < 12) return 'בוקר טוב'
    if (hour < 18) return 'צהריים טובים'
    return 'ערב טוב'
  }

  function formatDate() {
    return new Date().toLocaleDateString('he-IL', { weekday: 'long', month: 'long', day: 'numeric' })
  }

  function getImageUrl(attachment: { signed_url?: string | null; file_url?: string | null }): string {
    return attachment.signed_url || attachment.file_url || ''
  }

  const openTicketFnRef = useRef<(ticket: TicketRow, opts?: { skipDeepLink?: boolean }) => void>(() => {})

  const { clearDeepLink, markDeepLink: setTicketDeepLinkForOpen, openTicketById } = useTicketDeepLinkOpen({
    tickets,
    selectedTicketId: selectedTicket?.id,
    onOpenTicket: (ticket, opts) => openTicketFnRef.current(ticket, opts),
    mapFetchedTicket: mapFetchedTicketRow,
  })

  const closeDrawer = useCallback(() => {
    setSelectedTicket(null)
    setDraftDescription('')
    setDraftStatus('NEW')
    setDraftWorkerId('')
    resetTicketDetailData()
    clearDeepLink()
  }, [resetTicketDetailData, clearDeepLink])

  const openTicket = useCallback(
    (ticket: TicketRow, opts?: { skipDeepLink?: boolean }) => {
      setSelectedTicket(ticket)
      setDraftDescription(ticket.description || '')
      setDraftStatus(ticket.status)
      setDraftWorkerId(ticket.assigned_worker_id || '')
      void loadProfessionals()
      void loadTicketDrawerData(ticket)
      if (!opts?.skipDeepLink) {
        setTicketDeepLinkForOpen(ticket.id)
      }
    },
    [loadProfessionals, loadTicketDrawerData, setTicketDeepLinkForOpen]
  )

  openTicketFnRef.current = openTicket

  async function saveSelectedTicket() {
    if (!selectedTicket) return
    setSavingTicket(true)
    await asyncHandler(
      async () => {
        const { saveDashboardTicket } = await import('@/lib/dashboard-ticket-save')
        const { didAssign, closedNow, reporter_has_phone, whatsapp_sent } = await saveDashboardTicket({
          ticketId: selectedTicket.id,
          description: draftDescription,
          status: draftStatus,
          previousStatus: selectedTicket.status,
          draftWorkerId,
          previousWorkerId: selectedTicket.assigned_worker_id,
        })
        if (closedNow) toast.success(TM.ticketClosed)
        else if (didAssign) toast.success(TM.workerAssigned)
        else toast.success(TM.ticketUpdated)
        if (closedNow) {
          toastReporterClosedNotifySummary({
            success: true,
            reporter_has_phone,
            whatsapp_sent,
          })
          removeClosedTicketFromView(selectedTicket.id)
        } else {
          await loadData(true)
        }
        return true
      },
      { context: 'שמירת התקלה', showErrorToast: true }
    )
    setSavingTicket(false)
  }

  function removeClosedTicketFromView(ticketId: string) {
    setTickets((prev) => removeTicketFromListState(prev, ticketId))
    setClosedCount((c) => c + 1)
    closeDrawer()
  }

  async function performCloseTicket(ticketId: string) {
    const response = await fetchWithTimeout(
      '/api/close-ticket',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticketId }),
      },
      MUTATION_FETCH_TIMEOUT_MS
    )
    const closeBody = (await response.json().catch(() => ({}))) as ReporterClosedNotifyApiBody & {
      error?: string
    }
    if (!response.ok) {
      throw new Error(closeBody.error || TM.genericSaveError)
    }
    toast.success(TM.ticketClosed)
    toastReporterClosedNotifySummary(closeBody)
    removeClosedTicketFromView(ticketId)
    return closeBody
  }

  async function handleCloseTicket() {
    if (!selectedTicket) return
    setCloseConfirmTicket(selectedTicket)
  }

  async function confirmCloseTicket() {
    if (!closeConfirmTicket) return
    setClosingTicketId(closeConfirmTicket.id)
    await asyncHandler(
      async () => {
        await performCloseTicket(closeConfirmTicket.id)
        return true
      },
      { context: 'סגירת התקלה', showErrorToast: true }
    )
    setClosingTicketId(null)
    setCloseConfirmTicket(null)
  }

  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault()
    if (!addTicketProjectCode || !addTicketDescription.trim()) {
      setAddTicketError('נא למלא את כל השדות הנדרשים')
      return
    }
    setAddingTicket(true)
    setAddTicketError('')
    try {
      const formData = new FormData()
      formData.append('project_code', addTicketProjectCode)
      formData.append('description', addTicketDescription)
      if (addTicketReporterName) formData.append('reporter_name', addTicketReporterName)
      if (addTicketReporterPhone) formData.append('reporter_phone', addTicketReporterPhone)
      formData.append('source', 'manual')
      const response = await fetchWithTimeout(
        '/api/create-ticket',
        { method: 'POST', body: formData },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const result = await response.json()
      if (!response.ok) {
        throw new Error(errorMessageFromResponseJson(result, TM.genericSaveError))
      }
      toast.success(`טיקט #${result.ticketNumber} נוצר בהצלחה ✓`)
      setAddTicketProjectCode('')
      setAddTicketDescription('')
      setAddTicketReporterName('')
      setAddTicketReporterPhone('')
      setShowAddTicketModal(false)
      await loadData()
    } catch (err) {
      const message = err instanceof Error ? err.message : TM.genericSaveError
      setAddTicketError(message)
      toast.error(message)
    }
    setAddingTicket(false)
  }

  const openTicketsCount = stats.open

  return (
    <AppShell isMobile={isMobile}>
      {isMobile && (
        <MobileHeader
          title="לוח בקרה"
          subtitle={formatDate()}
          subtitleSuppressHydrationWarning
          onMenuClick={openMenu}
        />
      )}


      <div
        style={{
          ...styles.content,
          ...(isMobile
            ? { padding: '16px 16px 8px', maxWidth: '100%', boxSizing: 'border-box' }
            : {}),
        }}
      >
        <div style={styles.hero}>
          <div
            style={{
              ...styles.heroTop,
              ...(isMobile ? { flexDirection: 'column', alignItems: 'stretch' } : {}),
            }}
          >
         <div style={styles.heroText}>
  {!isMobile && (
    <h1 style={styles.heroTitle} suppressHydrationWarning>
      {getGreeting()}
    </h1>
  )}
  {openTicketsCount > 0 && (
    <p style={styles.heroStatus}>
      <span style={styles.statusDot} />
      {openTicketsCount} תקלות פתוחות דורשות טיפול
    </p>
  )}
  {isMobile && (
    <Link href="/tickets" style={styles.viewAllLink}>
      לכל התקלות והפעולות ←
    </Link>
  )}
</div>
            {!isMobile && (
              <div style={styles.heroActions}>
                <Button variant="primary" size="lg" onClick={() => setShowAddTicketModal(true)}>
                  תקלה חדשה
                </Button>
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <PageTransitionLoader />
        ) : pageLoadError ? (
          <ErrorState
            title="לא הצלחנו לטעון את לוח הבקרה"
            message="בדקו חיבור לאינטרנט ונסו שוב."
            onRetry={() => void loadData()}
          />
        ) : (
          <>
            <div style={{
              ...styles.kpiGrid,
              gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            }}>
              <KpiCard label="פעילות" value={stats.total} accent="primary" onClick={() => setActiveKpi('ALL')} />
              <KpiCard label="פתוחות" value={stats.open} accent="warning" onClick={() => setActiveKpi('NEW')} />
              <KpiCard label="בטיפול" value={stats.inProgress} accent="primary" onClick={() => setActiveKpi('IN_PROGRESS')} />
              <KpiCard label="נסגרו" value={stats.closed} accent="success" onClick={() => router.push('/summary?tab=history')} />
              {!isMobile && residentsCount !== null && <KpiCard label="דיירים רשומים" value={residentsCount} accent="primary" />}
              {!isMobile && workersCount !== null && <KpiCard label="עובדים פעילים" value={workersCount} accent="success" />}
            </div>

            <div style={{ ...styles.mainGrid, gridTemplateColumns: isMobile ? '1fr' : '1fr 340px' }}>
              {(!isMobile || mobileMoreOpen) && (
              <>
              <Card
                title="סטטוס פרויקטים"
                subtitle="בניינים עם עבודה פתוחה"
                actions={
                  <Link href="/projects" style={styles.viewAllLink}>
                    הצג הכל ←
                  </Link>
                }
              >
                <div style={styles.projectList}>
                  {projectStats.length === 0 ? (
                    <p style={styles.emptyText}>אין עדיין פרויקטים עם תקלות</p>
                  ) : (
                    projectStats.map((project) => (
                      <Link href={`/tickets?project=${encodeURIComponent(project.project_code)}`} key={project.id} style={styles.projectCard}>
                        <div style={styles.projectHeader}>
                          <div>
                            <div style={styles.projectName}>{project.name}</div>
                          </div>
                          <div style={styles.projectStats}>
                            <span style={styles.projectTicketCount}>{project.open} פתוחות</span>
                          </div>
                        </div>
                        <div style={styles.progressBarContainer}>
                          <div style={styles.progressBarBg}>
                            <div style={{ ...styles.progressBarFill, width: `${project.progress}%` }} />
                          </div>
                          <span style={styles.progressLabel}>{project.progress}% הושלמו</span>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </Card>

              <Card title="פעילות אחרונה" subtitle="עדכוני תקלות אחרונים">
                <div style={styles.activityList}>
                  {recentActivity.map((activity) => (
                    <button
                      key={activity.id}
                      type="button"
                      style={{ ...styles.activityItem, ...styles.activityButton }}
                      onClick={() => openTicketById(activity.ticket_id)}
                    >
                      <div style={styles.activityIcon}>
                        {activity.type === 'created' && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.colors.success} strokeWidth="2">
                            <circle cx="12" cy="12" r="10" /><path d="M12 8v8" /><path d="M8 12h8" />
                          </svg>
                        )}
                        {activity.type === 'closed' && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.colors.success} strokeWidth="2">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        )}
                        {activity.type === 'updated' && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={theme.colors.info} strokeWidth="2">
                            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                          </svg>
                        )}
                      </div>
                      <div style={styles.activityContent}>
                        <div style={styles.activityTitle}>
                          תקלה #{activity.ticket_number}
                          <span style={styles.activityBadge}>{activity.project_label}</span>
                        </div>
                        <div style={styles.activityDesc}>
                          {activity.description?.slice(0, 50)}{(activity.description?.length || 0) > 50 ? '...' : ''}
                        </div>
                      </div>
                      <div style={styles.activityTime}>{activity.time}</div>
                    </button>
                  ))}
                </div>
              </Card>
              </>
              )}

              {isMobile && !mobileMoreOpen && (
                <Button variant="ghost" size="sm" onClick={() => setMobileMoreOpen(true)} style={{ marginBottom: '12px' }}>
                  הצג עוד — פרויקטים ופעילות
                </Button>
              )}
            </div>

            <Card
              title="תקלות פעילות"
              subtitle={activeKpi === 'ALL' ? 'תקלות פתוחות' : `מסונן לפי ${activeKpi}`}
              actions={<Link href="/tickets" style={styles.viewAllLink}>הצג הכל</Link>}
              noPadding
            >
              {isMobile ? (
                <div style={styles.mobileCardList}>
                  {filteredTickets.map((ticket) => (
                    <TicketMobileCard
                      key={ticket.id}
                      ticket={ticket}
                      workerName={ticket.assigned_worker_id ? workersMap[ticket.assigned_worker_id] || 'לא ידוע' : 'לא משויך'}
                      onClick={() => openTicket(ticket)}
                    />
                  ))}
                </div>
              ) : (
              <div style={styles.tableContainer}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>#</th>
                      <th style={styles.th}>בניין</th>
                      <th style={styles.th}>תיאור</th>
                      <th style={styles.th}>סטטוס</th>
                      <th style={styles.th}>משויך</th>
                      <th style={styles.th}>גיל</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTickets.map((ticket) => (
                      <tr key={ticket.id} style={styles.tr} onClick={() => openTicket(ticket)}>
                        <td style={styles.td}><span style={styles.ticketNumber}>{ticket.ticket_number}</span></td>
                        <td style={styles.td}><span style={styles.projectBadge}>{ticket.project_name || ticket.project_code}</span></td>
                        <td style={{ ...styles.td, maxWidth: '300px' }}>
                          <span style={styles.descriptionText}>
                            {ticket.description?.slice(0, 60)}{(ticket.description?.length || 0) > 60 ? '...' : ''}
                          </span>
                        </td>
                        <td style={styles.td}><StatusBadge status={ticket.status} size="sm" /></td>
                        <td style={styles.td}>
                          <span style={styles.workerName}>
                            {ticket.assigned_worker_id ? workersMap[ticket.assigned_worker_id] || 'לא ידוע' : '—'}
                          </span>
                        </td>
                        <td style={styles.td}><span style={styles.ageText}>{formatRelativeTime(ticket.created_at)}</span></td>
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

      {/* Ticket Detail Drawer */}
      <TicketDetailDrawer
        selectedTicket={selectedTicket}
        workersMap={workersMap}
        professionals={professionals}
        onTicketForwarded={async () => {
          await loadData(true)
          if (selectedTicket) {
            setDraftStatus('PROFESSIONAL_ESCORT')
            void loadTicketDrawerData(selectedTicket)
          }
        }}
        ticketLogs={ticketLogs}
        selectedTicketAttachments={selectedTicketAttachments}
        drawerLoading={drawerLoading}
        loadingAttachments={loadingAttachments}
        recoveringMedia={recoveringMedia}
        onRecoverMedia={
          selectedTicket
            ? async () => {
                await recoverAndReloadAttachments(selectedTicket)
              }
            : undefined
        }
        savingTicket={savingTicket}
        draftDescription={draftDescription}
        draftStatus={draftStatus}
        draftWorkerId={draftWorkerId}
        onClose={closeDrawer}
        onSave={saveSelectedTicket}
        onDescriptionChange={setDraftDescription}
        onStatusChange={setDraftStatus}
        onWorkerChange={setDraftWorkerId}
        onSelectImage={setSelectedImageUrl}
        onCloseTicket={handleCloseTicket}
        getImageUrl={getImageUrl}
        isMobile={isMobile}
      />

      {/* Add Ticket Modal */}
      <AddTicketModal
        open={showAddTicketModal}
        onClose={() => setShowAddTicketModal(false)}
        isMobile={isMobile}
        projects={projects}
        projectCode={addTicketProjectCode}
        description={addTicketDescription}
        reporterName={addTicketReporterName}
        reporterPhone={addTicketReporterPhone}
        error={addTicketError}
        loading={addingTicket}
        onProjectCodeChange={setAddTicketProjectCode}
        onDescriptionChange={setAddTicketDescription}
        onReporterNameChange={setAddTicketReporterName}
        onReporterPhoneChange={setAddTicketReporterPhone}
        onSubmit={handleCreateTicket}
      />

      {isMobile && (
        <button
          type="button"
          onClick={() => setShowAddTicketModal(true)}
          style={styles.fab}
          aria-label="תקלה חדשה"
        >
          +
        </button>
      )}

      <CloseTicketConfirmSheet
        open={!!closeConfirmTicket}
        ticketNumber={closeConfirmTicket?.ticket_number ?? 0}
        loading={!!closingTicketId}
        isMobile={isMobile}
        onConfirm={() => void confirmCloseTicket()}
        onCancel={() => {
          if (!closingTicketId) setCloseConfirmTicket(null)
        }}
      />

      <ImageLightbox imageUrl={selectedImageUrl} onClose={() => setSelectedImageUrl(null)} />
    </AppShell>
  )
}

const styles: Record<string, CSSProperties> = {
  content: { padding: '32px 40px', maxWidth: '1400px', margin: '0 auto' },
  hero: { marginBottom: '40px' },
  heroTop: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '20px',
    flexWrap: 'wrap',
  },
  heroText: { flex: 1, minWidth: 0 },
  heroTitle: { fontSize: '34px', fontWeight: 700, color: theme.colors.textPrimary, margin: 0, letterSpacing: '-0.02em' },
  heroDate: { fontSize: '17px', color: theme.colors.textMuted, margin: '8px 0 0' },
  heroStatus: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', color: theme.colors.textSecondary, margin: '16px 0 0' },
  statusDot: { width: '8px', height: '8px', borderRadius: '50%', background: theme.colors.warning },
  heroActions: { display: 'flex', gap: '12px' },
  loadingContainer: { display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '80px 0' },
  kpiGrid: { display: 'grid', gap: '16px', marginBottom: '32px' },
  mainGrid: { display: 'grid', gap: '24px', marginBottom: '32px' },
  projectList: { display: 'flex', flexDirection: 'column', gap: '16px' },
  projectCard: { display: 'block', padding: '16px', borderRadius: theme.radius.md, border: `1px solid ${theme.colors.border}`, textDecoration: 'none', transition: 'all 0.2s ease', cursor: 'pointer' },
  projectHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' },
  projectName: { fontSize: '15px', fontWeight: 600, color: theme.colors.textPrimary },
  projectCode: { fontSize: '13px', color: theme.colors.textMuted, marginTop: '2px' },
  projectStats: { textAlign: 'right' },
  projectTicketCount: { fontSize: '13px', fontWeight: 500, color: theme.colors.warning },
  progressBarContainer: { display: 'flex', alignItems: 'center', gap: '12px' },
  progressBarBg: { flex: 1, height: '4px', background: theme.colors.muted, borderRadius: '2px', overflow: 'hidden' },
  progressBarFill: { height: '100%', background: theme.colors.primary, borderRadius: '2px', transition: 'width 0.3s ease' },
  progressLabel: { fontSize: '12px', color: theme.colors.textMuted, flexShrink: 0 },
  activityList: { display: 'flex', flexDirection: 'column', gap: '4px' },
  activityItem: { display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 0', borderBottom: `1px solid ${theme.colors.border}` },
  activityButton: { width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'right' as const, fontFamily: 'inherit' },
  activityIcon: { width: '32px', height: '32px', borderRadius: theme.radius.full, background: theme.colors.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  activityContent: { flex: 1, minWidth: 0 },
  activityTitle: { fontSize: '14px', fontWeight: 500, color: theme.colors.textPrimary, display: 'flex', alignItems: 'center', gap: '8px' },
  activityBadge: { fontSize: '11px', fontWeight: 500, color: theme.colors.textMuted, background: theme.colors.muted, padding: '2px 6px', borderRadius: theme.radius.xs },
  activityDesc: { fontSize: '13px', color: theme.colors.textMuted, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  activityTime: { fontSize: '12px', color: theme.colors.textMuted, flexShrink: 0 },
  viewAllLink: { fontSize: '14px', fontWeight: 500, color: theme.colors.primary, textDecoration: 'none' },
  tableContainer: { overflowX: 'auto' },
  mobileCardList: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px 16px 20px' },
  fab: {
    position: 'fixed',
    left: '20px',
    bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))',
    zIndex: 90,
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    border: 'none',
    background: theme.colors.primary,
    color: '#fff',
    fontSize: '28px',
    fontWeight: 300,
    lineHeight: 1,
    cursor: 'pointer',
    boxShadow: theme.shadows.lg,
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { textAlign: 'start', padding: '14px 20px', fontSize: '12px', fontWeight: 600, color: theme.colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${theme.colors.border}`, background: theme.colors.muted },
  tr: { cursor: 'pointer', transition: 'background 0.15s ease' },
  td: { padding: '16px 20px', fontSize: '14px', color: theme.colors.textPrimary, borderBottom: `1px solid ${theme.colors.border}`, verticalAlign: 'middle' },
  ticketNumber: { fontWeight: 600, fontVariantNumeric: 'tabular-nums' },
  projectBadge: { fontSize: '12px', fontWeight: 500, color: theme.colors.textMuted, background: theme.colors.muted, padding: '4px 8px', borderRadius: theme.radius.sm },
  descriptionText: { color: theme.colors.textSecondary },
  workerName: { color: theme.colors.textSecondary },
  ageText: { color: theme.colors.textMuted, fontSize: '13px' },
  emptyText: { textAlign: 'center', color: theme.colors.textMuted, padding: '32px 0' },
}