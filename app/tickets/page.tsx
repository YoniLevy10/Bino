/**
 * /tickets — דף ניהול תקלות
 *
 * @description
 * מציג עד 300 תקלות אחרונות (מסודרות לפי created_at DESC).
 * תמיכה בסינון לפי: סטטוס, עדיפות, פרויקט, עובד משויך.
 * ייצוא Excel לרשימה המסוננת.
 * מגירת פרטים לכל תקלה: שיוך עובד, סגירה, מיזוג, תמונות.
 * ticketsTruncated=true → מציג באנר אזהרה שמציג 300 תקלות בלבד.
 *
 * @limit 300 תקלות אחרונות — להצגת ישנות יותר: ייצוא Excel
 */
'use client'

/**
 * דף תקלות – רשימת כל התקלות עם סינון, חיפוש ויצוא.
 *
 * מציג: KPI לפי סטטוס, טבלת תקלות עם עמודות (מספר, פרויקט, דייר, סטטוס, עדיפות, תאריך),
 * סינון לפי סטטוס / פרויקט / עדיפות, וחיפוש חופשי.
 *
 * פעולות:
 *  - "יצוא Excel" → מוריד קובץ xlsx עם כל התקלות הנוכחיות
 *  - לחיצה על שורה → פותח TicketDetailDrawer עם פרטים מלאים + לוג
 *  - "סגירת תקלה" → PATCH /api/close-ticket
 *  - "מיזוג" → POST /api/merge-ticket
 *  - "הודעת סגירה" → POST /api/notify-reporter-ticket-closed
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { resolveBamakorClientIdForBrowser } from '@/lib/bamakor-client'
import { withSignedAttachmentUrls } from '@/lib/ticket-attachment-url'
import { withClientId } from '@/lib/supabase/with-client-id'
import { toast, asyncHandler } from '@/lib/error-handler'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { TM } from '@/lib/toast-messages'
import {
  toastReporterClosedNotifySummary,
  type ReporterClosedNotifyApiBody,
} from '@/lib/reporter-closed-notify-toast'
import { ForwardToProfessionalBlock, type ProfessionalOption } from '../components/tickets/ForwardToProfessionalBlock'
import {
  AppShell,
  MobileHeader,
  MobileMenu,
  PageHeader,
  KpiCard,
  Card,
  Button,
  StatusBadge,
  PriorityDot,
  SearchInput,
  Select,
  Drawer,
  EmptyState,
  LoadingSpinner,
  theme
} from '../components/ui'
import { useIsMobile } from '@/lib/use-is-mobile'
import { shouldSkipStalePageCache } from '@/lib/app-splash-session'
import { removeTicketFromListState } from '@/lib/open-tickets'
import { PageListSkeleton } from '../components/page-skeleton'
import { ImageLightbox } from '../components/shared/ImageLightbox'
import { TicketAttachmentThumb } from '../components/shared/TicketAttachmentThumb'
import { TicketChat } from '../components/tickets/TicketChat'
import { TicketMobileCard } from '../components/tickets/TicketMobileCard'
import { CloseTicketConfirmSheet } from '../components/tickets/CloseTicketConfirmSheet'
import {
  OPEN_TICKET_STATUS_FILTER_OPTIONS,
  ticketStatusLabelHe,
  isTicketInTreatment,
} from '@/lib/ticket-status'

type TicketRow = {
  id: string
  ticket_number: number
  client_id?: string | null
  project_id?: string | null
  project_code?: string
  project_name?: string
  reporter_phone?: string | null
  reporter_name?: string | null
  description?: string | null
  status: string
  priority?: string | null
  assigned_worker_id?: string | null
  building_number?: string | null
  created_at?: string
  closed_at?: string | null
  projects?:
    | { name?: string | null; project_code?: string | null }[]
    | { name?: string | null; project_code?: string | null }
    | null
}

type AttachmentRow = {
  id: string
  ticket_id: string
  file_name: string | null
  file_url: string | null
  mime_type: string | null
  attachment_type: string
  whatsapp_media_id: string | null
  created_at: string | null
  signed_url?: string | null
}

type WorkerRow = {
  id: string
  full_name: string
  phone?: string | null
  email?: string | null
  role?: string | null
  is_active?: boolean | null
}

type ProjectRow = {
  id: string
  name: string
  project_code: string
}

const statusOptions = OPEN_TICKET_STATUS_FILTER_OPTIONS

const REFRESH_DEBOUNCE_MS = 30_000

const MOBILE_QUICK_STATUS_CHIPS: { label: string; value: string }[] = [
  { label: 'הכל', value: 'ALL' },
  { label: 'חדשות', value: 'NEW' },
  { label: 'בטיפול', value: 'IN_PROGRESS' },
  { label: 'דחופות', value: 'URGENT' },
]

const priorityOptions = [
  { label: 'כל העדיפויות', value: 'ALL' },
  { label: 'דחופה', value: 'URGENT' },
  { label: 'גבוהה', value: 'HIGH' },
  { label: 'בינונית', value: 'MEDIUM' },
  { label: 'נמוכה', value: 'LOW' },
]

const TICKETS_CACHE_TTL_MS = 24 * 60 * 60 * 1000

type TicketsCache = {
  tickets: TicketRow[]
  workers: WorkerRow[]
  projects: ProjectRow[]
  ticketsTruncated: boolean
  savedAt: number
}

function readTicketsCache(clientId: string): TicketsCache | null {
  try {
    const key = `bamakor_tickets_v2_${clientId}`
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as TicketsCache
    if (Date.now() - parsed.savedAt > TICKETS_CACHE_TTL_MS) return null
    return parsed
  } catch { return null }
}

function writeTicketsCache(clientId: string, data: Omit<TicketsCache, 'savedAt'>) {
  try {
    const key = `bamakor_tickets_v2_${clientId}`
    localStorage.setItem(key, JSON.stringify({ ...data, savedAt: Date.now() }))
  } catch { /* storage full or unavailable */ }
}

const TICKETS_LIST_SELECT = `
  id, ticket_number, client_id, project_id, reporter_phone, reporter_name,
  description, status, priority, assigned_worker_id, building_number,
  created_at, closed_at,
  projects (name, project_code)
`.trim()

export default function TicketsPage() {
  const [tickets, setTickets] = useState<TicketRow[]>([])
  const [workers, setWorkers] = useState<WorkerRow[]>([])
  const [professionals, setProfessionals] = useState<ProfessionalOption[]>([])
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [priorityFilter, setPriorityFilter] = useState('ALL')
  const [projectFilter, setProjectFilter] = useState('ALL')
  const [workerFilter, setWorkerFilter] = useState('ALL')
  const isMobile = useIsMobile()
  const lastFetchAtRef = useRef(0)
  const [closeConfirmTicket, setCloseConfirmTicket] = useState<TicketRow | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<TicketRow | null>(null)
  const [draftPriority, setDraftPriority] = useState<string>('')
  const [draftStatus, setDraftStatus] = useState<string>('')
  const [draftWorkerId, setDraftWorkerId] = useState<string>('')
  const [savingTicket, setSavingTicket] = useState(false)
  const [closingTicketId, setClosingTicketId] = useState<string | null>(null)
  const [selectedTicketIds, setSelectedTicketIds] = useState<Set<string>>(() => new Set())
  const [deletingTickets, setDeletingTickets] = useState(false)
  const [selectedTicketAttachments, setSelectedTicketAttachments] = useState<AttachmentRow[]>([])
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)
  const [loadingAttachments, setLoadingAttachments] = useState(false)
  const [showAddTicketModal, setShowAddTicketModal] = useState(false)
  const [addTicketForm, setAddTicketForm] = useState({
    project_code: '',
    description: '',
    reporter_name: '',
    reporter_phone: '',
  })
  const [addingTicket, setAddingTicket] = useState(false)
  const [addTicketError, setAddTicketError] = useState('')
  const [descriptionTranslation, setDescriptionTranslation] = useState('')
  const [translating, setTranslating] = useState(false)
  const [mergeCandidates, setMergeCandidates] = useState<TicketRow[]>([])
  const [mergeLoading, setMergeLoading] = useState(false)
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false)
  const [tenantClientId, setTenantClientId] = useState('')
  const [ticketsTruncated, setTicketsTruncated] = useState(false)
  const [activeDetailTab, setActiveDetailTab] = useState<'details' | 'chat'>('details')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('project')) setProjectFilter(decodeURIComponent(params.get('project')!))
      if (params.get('worker')) setWorkerFilter(decodeURIComponent(params.get('worker')!))
      const statusParam = params.get('status')
      if (statusParam && statusParam !== 'CLOSED') {
        setStatusFilter(decodeURIComponent(statusParam))
      }
      if (params.get('priority')) setPriorityFilter(decodeURIComponent(params.get('priority')!))
      if (params.get('new') === '1') setShowAddTicketModal(true)
    }
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams()
      if (projectFilter !== 'ALL') params.set('project', projectFilter)
      if (workerFilter !== 'ALL') params.set('worker', workerFilter)
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      if (priorityFilter !== 'ALL') params.set('priority', priorityFilter)
      const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname
      window.history.replaceState(null, '', newUrl)
    }
  }, [projectFilter, workerFilter, statusFilter, priorityFilter])

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    await asyncHandler(
      async () => {
        const clientId = await resolveBamakorClientIdForBrowser()
        setTenantClientId(clientId)
        const [ticketsResult, workersResult, professionalsResult, projectsResult] = await Promise.all([
          withClientId(supabase.from('tickets').select(TICKETS_LIST_SELECT), clientId)
            .is('deleted_at', null)
            .neq('status', 'CLOSED')
            .order('created_at', { ascending: false })
            .limit(300),
          withClientId(supabase.from('workers').select('id, full_name, phone, email, role, is_active'), clientId)
            .is('deleted_at', null)
            .order('full_name', { ascending: true }),
          withClientId(
            supabase.from('professionals').select('id, full_name, phone, trade, is_active'),
            clientId
          )
            .is('deleted_at', null)
            .order('full_name', { ascending: true }),
          withClientId(supabase.from('projects').select('id, name, project_code'), clientId).order(
            'project_code',
            { ascending: true }
          ),
        ])

        if (ticketsResult.error) throw ticketsResult.error
        if (workersResult.error) throw workersResult.error
        if (projectsResult.error) throw projectsResult.error

        const normalizedTickets: TicketRow[] = ((ticketsResult.data ?? []) as unknown as TicketRow[]).map(
          (ticket) => {
            const project = Array.isArray(ticket.projects) ? ticket.projects[0] : ticket.projects
            return {
              ...ticket,
              project_code: project?.project_code || '',
              project_name: project?.name || '',
            }
          }
        )

        setTickets(normalizedTickets)
        setTicketsTruncated(normalizedTickets.length >= 300)
        setWorkers((workersResult.data as WorkerRow[]) || [])
        setProfessionals(
          professionalsResult.error
            ? []
            : ((professionalsResult.data as ProfessionalOption[]) || [])
        )
        setProjects((projectsResult.data as ProjectRow[]) || [])
        writeTicketsCache(clientId, {
          tickets: normalizedTickets,
          workers: (workersResult.data as WorkerRow[]) || [],
          projects: (projectsResult.data as ProjectRow[]) || [],
          ticketsTruncated: normalizedTickets.length >= 300,
        })
        lastFetchAtRef.current = Date.now()
        return true
      },
      { context: 'טעינת תקלות', showErrorToast: true }
    )
    if (!silent) setLoading(false)
  }, [])

  const debouncedFetchData = useCallback(
    (silent = false) => {
      if (Date.now() - lastFetchAtRef.current < REFRESH_DEBOUNCE_MS) return
      void fetchData(silent)
    },
    [fetchData]
  )

  useEffect(() => {
    void (async () => {
      const clientId = await resolveBamakorClientIdForBrowser()
      const cached = shouldSkipStalePageCache() ? null : readTicketsCache(clientId)
      if (cached) {
        setTickets(cached.tickets.filter((t) => t.status !== 'CLOSED'))
        setWorkers(cached.workers)
        setProjects(cached.projects)
        setTicketsTruncated(cached.ticketsTruncated)
        setLoading(false)
        void fetchData(true)
      } else {
        void fetchData()
      }
    })()
  }, [fetchData])

  // Supabase Realtime — silent refresh when tickets change
  useEffect(() => {
    const channel = supabase
      .channel('tickets-page-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
        debouncedFetchData(true)
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [debouncedFetchData])

  // Visibility API — silent refresh when returning to tab
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') debouncedFetchData(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [debouncedFetchData])

  const stats = useMemo(() => {
    const total = tickets.length
    const open = tickets.filter((t) => t.status === 'NEW').length
    const assigned = tickets.filter((t) => isTicketInTreatment(t.status)).length
    return { total, open, assigned }
  }, [tickets])

  const projectOptions = useMemo(() => {
    return [
      { label: 'כל הפרויקטים', value: 'ALL' },
      ...projects.map((p) => ({ label: p.name, value: p.project_code })),
    ]
  }, [projects])

  const workerOptions = useMemo(() => {
    return [
      { label: 'כל העובדים', value: 'ALL' },
      ...workers.map((w) => ({ label: w.full_name, value: w.id })),
    ]
  }, [workers])

  const activeFilterCount = useMemo(() => {
    let n = 0
    if (statusFilter !== 'ALL') n++
    if (priorityFilter !== 'ALL') n++
    if (projectFilter !== 'ALL') n++
    if (workerFilter !== 'ALL') n++
    return n
  }, [statusFilter, priorityFilter, projectFilter, workerFilter])

  const filteredTickets = useMemo(() => {
    return tickets.filter((ticket) => {
      const q = searchTerm.trim().toLowerCase()
      const matchesSearch = !q ||
        String(ticket.ticket_number).includes(q) ||
        (ticket.project_code || '').toLowerCase().includes(q) ||
        (ticket.project_name || '').toLowerCase().includes(q) ||
        (ticket.description || '').toLowerCase().includes(q) ||
        (ticket.reporter_phone || '').toLowerCase().includes(q) ||
        (ticket.reporter_name || '').toLowerCase().includes(q)

      const matchesStatus = statusFilter === 'ALL' || ticket.status === statusFilter
      const matchesPriority = priorityFilter === 'ALL' || (ticket.priority || '').toUpperCase() === priorityFilter
      const matchesProject = projectFilter === 'ALL' || ticket.project_code === projectFilter
      const matchesWorker = workerFilter === 'ALL' || ticket.assigned_worker_id === workerFilter

      return matchesSearch && matchesStatus && matchesPriority && matchesProject && matchesWorker
    })
  }, [tickets, searchTerm, statusFilter, priorityFilter, projectFilter, workerFilter])

  const allFilteredSelected =
    filteredTickets.length > 0 && filteredTickets.every((t) => selectedTicketIds.has(t.id))

  function toggleTicketSelection(ticketId: string, e: React.MouseEvent | React.ChangeEvent) {
    e.stopPropagation()
    setSelectedTicketIds((prev) => {
      const next = new Set(prev)
      if (next.has(ticketId)) next.delete(ticketId)
      else next.add(ticketId)
      return next
    })
  }

  function toggleSelectAllFiltered(e: React.ChangeEvent<HTMLInputElement>) {
    e.stopPropagation()
    if (allFilteredSelected) {
      setSelectedTicketIds(new Set())
    } else {
      setSelectedTicketIds(new Set(filteredTickets.map((t) => t.id)))
    }
  }

  async function requestDeleteTickets(payload: { ticket_ids: string[] } | { delete_all: true }) {
    setDeletingTickets(true)
    try {
      const res = await fetchWithTimeout('/api/tickets/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string; deleted_count?: number }
      if (!res.ok) throw new Error(json.error || 'מחיקה נכשלה')
      toast.success(`נמחקו ${json.deleted_count ?? 0} תקלות`)
      setSelectedTicketIds(new Set())
      const deletedIds = 'ticket_ids' in payload ? payload.ticket_ids : null
      if (selectedTicket && (deletedIds ? deletedIds.includes(selectedTicket.id) : true)) {
        closeDrawer()
      }
      await fetchData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'מחיקה נכשלה')
    }
    setDeletingTickets(false)
  }

  async function deleteSelectedTickets() {
    if (selectedTicketIds.size === 0) return
    const n = selectedTicketIds.size
    if (!window.confirm(`למחוק ${n} תקלות שנבחרו? הן יוסרו מהמערכת.`)) return
    await requestDeleteTickets({ ticket_ids: [...selectedTicketIds] })
  }

  async function deleteAllTickets() {
    if (!window.confirm('למחוק את כל התקלות של הארגון? (כולל תקלות שלא מוצגות ברשימה)')) return
    await requestDeleteTickets({ delete_all: true })
  }

  async function deleteSingleTicket() {
    if (!selectedTicket) return
    if (!window.confirm(`למחוק תקלה #${selectedTicket.ticket_number}?`)) return
    await requestDeleteTickets({ ticket_ids: [selectedTicket.id] })
  }

  function getWorkerName(workerId?: string | null) {
    if (!workerId) return 'לא משויך'
    const worker = workers.find((w) => w.id === workerId)
    return worker?.full_name || 'לא ידוע'
  }

  const priorityLabelHe: Record<string, string> = {
    URGENT: 'דחופה',
    HIGH: 'גבוהה',
    MEDIUM: 'בינונית',
    LOW: 'נמוכה',
  }

  function treatmentDaysForExport(t: TicketRow): string {
    if (!t.created_at) return ''
    const start = new Date(t.created_at).getTime()
    const end = t.closed_at ? new Date(t.closed_at).getTime() : Date.now()
    const days = (end - start) / 86_400_000
    if (!Number.isFinite(days) || days < 0) return '0'
    return days < 1 ? '<1' : days.toFixed(1)
  }

  async function exportToExcel() {
    const { XLSXStyle: XLSX, applyHeaderStyle, applyDataStyles, setCellStyle, STATUS_STYLES, PRIORITY_STYLES } =
      await import('@/lib/excel-style')
    const list = filteredTickets
    const rows = list.map((t) => ({
      '#': t.ticket_number,
      'תאריך פתיחה': t.created_at ? new Date(t.created_at).toLocaleString('he-IL') : '',
      'תאריך סגירה': t.closed_at ? new Date(t.closed_at).toLocaleString('he-IL') : '',
      'בניין': t.project_name || t.project_code || '',
      'דירה': t.building_number || '',
      'תיאור': t.description || '',
      'עדיפות': priorityLabelHe[(t.priority || 'MEDIUM').toUpperCase()] || (t.priority || ''),
      'סטטוס': ticketStatusLabelHe(t.status),
      'עובד משויך': getWorkerName(t.assigned_worker_id),
      'ימי טיפול': treatmentDaysForExport(t),
    }))

    const ws = XLSX.utils.json_to_sheet(rows)
    const COLS = 10
    ws['!cols'] = [{ wch: 6 }, { wch: 18 }, { wch: 18 }, { wch: 22 }, { wch: 7 }, { wch: 42 }, { wch: 10 }, { wch: 12 }, { wch: 18 }, { wch: 10 }]
    ws['!freeze'] = { xSplit: 0, ySplit: 1 }
    ws['!autofilter'] = { ref: ws['!ref'] as string }

    applyHeaderStyle(ws, COLS)
    applyDataStyles(ws, list.length, COLS)

    // צבע עמודת סטטוס (7) ועדיפות (6)
    list.forEach((t, i) => {
      const r = i + 1
      const sStyle = STATUS_STYLES[t.status]
      const pStyle = PRIORITY_STYLES[(t.priority || 'MEDIUM').toUpperCase()]
      if (sStyle) setCellStyle(ws, r, 7, sStyle)
      if (pStyle) setCellStyle(ws, r, 6, pStyle)
    })

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'תקלות')
    const day = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `bamakor-tickets-${day}.xlsx`)
    toast.success(TM.excelExported)
  }

  async function loadMergeCandidates(ticket: TicketRow) {
    if (!ticket.project_id) return
    setMergeLoading(true)
    try {
      const cid = tenantClientId || (await resolveBamakorClientIdForBrowser())
      const { data, error } = await withClientId(
        supabase.from('tickets').select(
          `
          id, ticket_number, project_id, description, status, created_at,
          projects (name, project_code)
        `
        ),
        cid
      )
        .eq('project_id', ticket.project_id)
        .neq('id', ticket.id)
        .is('deleted_at', null)
        .neq('status', 'CLOSED')
        .order('created_at', { ascending: false })

      if (error) throw error
      const normalized: TicketRow[] = (data || []).map((row: TicketRow) => {
        const project = Array.isArray(row.projects) ? row.projects[0] : row.projects
        return {
          ...row,
          project_code: project?.project_code || '',
          project_name: project?.name || '',
        }
      })
      setMergeCandidates(normalized)
    } catch {
      setMergeCandidates([])
      toast.error('טעינת תקלות למיזוג נכשלה')
    }
    setMergeLoading(false)
  }

  async function runMerge(targetId: string) {
    if (!selectedTicket) return
    setSavingTicket(true)
    try {
      const res = await fetchWithTimeout('/api/merge-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_ticket_id: selectedTicket.id,
          target_ticket_id: targetId,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'מיזוג נכשל')
      toast.success(`מוזג לתקלה #${json.merged_into_ticket_number}`)
      closeDrawer()
      await fetchData()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'מיזוג נכשל')
    }
    setSavingTicket(false)
  }

  async function translateDescription() {
    if (!selectedTicket?.description?.trim()) return
    setTranslating(true)
    setDescriptionTranslation('')
    try {
      const res = await fetchWithTimeout('/api/translate-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: selectedTicket.description }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'תרגום נכשל')
      setDescriptionTranslation(json.translation || '')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'תרגום נכשל')
    }
    setTranslating(false)
  }

  function getTicketAge(createdAt?: string): string {
    if (!createdAt) return '-'
    const now = new Date()
    const created = new Date(createdAt)
    const diffMs = now.getTime() - created.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays > 0) return `${diffDays}d`
    if (diffHours > 0) return `${diffHours}h`
    return 'now'
  }

  function openTicket(ticket: TicketRow) {
    if (selectedTicket?.id === ticket.id) {
      closeDrawer()
      return
    }
    setMobileToolsOpen(false)
    setSelectedTicket(ticket)
    setDraftPriority(ticket.priority || 'LOW')
    setDraftStatus(ticket.status)
    setDraftWorkerId(ticket.assigned_worker_id || '')
    setSelectedTicketAttachments([])
    setDescriptionTranslation('')
    setMergeCandidates([])
    loadTicketAttachments(ticket.id)
  }

  function handleTicketRowKeyDown(e: KeyboardEvent<HTMLTableRowElement>, ticket: TicketRow) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openTicket(ticket)
    }
  }

  async function loadTicketAttachments(ticketId: string) {
    setLoadingAttachments(true)
    try {
      const { data } = await supabase
        .from('ticket_attachments')
        .select('id, ticket_id, file_name, file_url, mime_type, attachment_type, whatsapp_media_id, created_at')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: false })

      if (data && data.length > 0) {
        const attachmentsWithUrls = await withSignedAttachmentUrls(supabase, data as AttachmentRow[])
        setSelectedTicketAttachments(attachmentsWithUrls)
      } else {
        setSelectedTicketAttachments([])
      }
    } catch {
      setSelectedTicketAttachments([])
    }
    setLoadingAttachments(false)
  }

  function closeDrawer() {
    setSelectedTicket(null)
    setDraftPriority('')
    setDraftStatus('')
    setDraftWorkerId('')
    setSelectedTicketAttachments([])
    setDescriptionTranslation('')
    setMergeCandidates([])
    setActiveDetailTab('details')
  }

  async function saveTicketChanges() {
    if (!selectedTicket) return
    setSavingTicket(true)
    try {
      const { saveDashboardTicket } = await import('@/lib/dashboard-ticket-save')
      const { didAssign, closedNow, reporter_has_phone, whatsapp_sent } = await saveDashboardTicket({
        ticketId: selectedTicket.id,
        priority: draftPriority,
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
      }

      await fetchData()
      setSelectedTicket((prev) => prev ? { ...prev, priority: draftPriority, status: draftStatus, assigned_worker_id: draftWorkerId || null } : prev)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : TM.genericSaveError)
    }
    setSavingTicket(false)
  }

  function removeClosedTicketFromView(ticketId: string) {
    setTickets((prev) => {
      const next = removeTicketFromListState(prev, ticketId)
      if (tenantClientId) {
        writeTicketsCache(tenantClientId, {
          tickets: next,
          workers,
          projects,
          ticketsTruncated,
        })
      }
      return next
    })
    if (selectedTicket?.id === ticketId) closeDrawer()
  }

  async function performCloseTicket(ticketId: string) {
    const response = await fetchWithTimeout('/api/close-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_id: ticketId }),
    })
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

  function requestCloseTicket(ticket: TicketRow) {
    setCloseConfirmTicket(ticket)
  }

  async function confirmCloseTicket() {
    if (!closeConfirmTicket) return
    setClosingTicketId(closeConfirmTicket.id)
    try {
      await performCloseTicket(closeConfirmTicket.id)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : TM.genericSaveError)
    }
    setClosingTicketId(null)
    setCloseConfirmTicket(null)
  }

  async function handleCloseTicket() {
    if (!selectedTicket) return
    requestCloseTicket(selectedTicket)
  }

  function applyMobileQuickChip(chip: string) {
    if (chip === 'ALL') {
      setStatusFilter('ALL')
      setPriorityFilter('ALL')
    } else if (chip === 'NEW') {
      setStatusFilter('NEW')
      setPriorityFilter('ALL')
    } else if (chip === 'IN_PROGRESS') {
      setStatusFilter('IN_PROGRESS')
      setPriorityFilter('ALL')
    } else if (chip === 'URGENT') {
      setStatusFilter('ALL')
      setPriorityFilter('URGENT')
    }
  }

  function isMobileQuickChipActive(chip: string): boolean {
    if (chip === 'ALL') return statusFilter === 'ALL' && priorityFilter === 'ALL'
    if (chip === 'NEW') return statusFilter === 'NEW' && priorityFilter === 'ALL'
    if (chip === 'IN_PROGRESS') return statusFilter === 'IN_PROGRESS' && priorityFilter === 'ALL'
    if (chip === 'URGENT') return priorityFilter === 'URGENT' && statusFilter === 'ALL'
    return false
  }

  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault()
    if (!addTicketForm.project_code) {
      setAddTicketError('נא לבחור פרויקט')
      return
    }
    if (!addTicketForm.description || addTicketForm.description.trim().length < 3) {
      setAddTicketError('התיאור חייב להכיל לפחות 3 תווים')
      return
    }

    setAddingTicket(true)
    setAddTicketError('')

    try {
      const formData = new FormData()
      formData.append('project_code', addTicketForm.project_code)
      formData.append('description', addTicketForm.description)
      if (addTicketForm.reporter_name) formData.append('reporter_name', addTicketForm.reporter_name)
      if (addTicketForm.reporter_phone) formData.append('reporter_phone', addTicketForm.reporter_phone)
      formData.append('source', 'manual')

      const response = await fetchWithTimeout('/api/create-ticket', { method: 'POST', body: formData })
      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || TM.genericSaveError)
      }

      const result = await response.json()
      toast.success(`טיקט #${result.ticketNumber} נוצר בהצלחה ✓`)
      setAddTicketForm({ project_code: '', description: '', reporter_name: '', reporter_phone: '' })
      setShowAddTicketModal(false)
      await fetchData()
    } catch (err) {
      const message = err instanceof Error ? err.message : TM.genericSaveError
      setAddTicketError(message)
      toast.error(message)
    }
    setAddingTicket(false)
  }

  return (
    <AppShell isMobile={isMobile}>
      {isMobile && (
        <MobileHeader
          title="תקלות"
          subtitle={`${filteredTickets.length} תקלות`}
          onMenuClick={() => setMenuOpen(true)}
        />
      )}

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <Drawer
        open={mobileToolsOpen && isMobile}
        onClose={() => setMobileToolsOpen(false)}
        title="סינון וייצוא"
        subtitle="התאימו את הרשימה או הורידו קובץ"
        isMobile={isMobile}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={statusOptions}
            style={{ width: '100%', minWidth: 0 }}
          />
          <Select
            value={priorityFilter}
            onChange={setPriorityFilter}
            options={priorityOptions}
            style={{ width: '100%', minWidth: 0 }}
          />
          <Select
            value={projectFilter}
            onChange={setProjectFilter}
            options={projectOptions}
            style={{ width: '100%', minWidth: 0 }}
          />
          <Select
            value={workerFilter}
            onChange={setWorkerFilter}
            options={workerOptions}
            style={{ width: '100%', minWidth: 0 }}
          />
          <div
            style={{
              height: '1px',
              background: theme.colors.border,
              margin: '4px 0',
            }}
          />
          <Button
            variant="secondary"
            size="md"
            type="button"
            style={{ width: '100%' }}
            onClick={() => {
              exportToExcel()
              setMobileToolsOpen(false)
            }}
          >
            ייצוא Excel
          </Button>
          {selectedTicketIds.size > 0 && (
            <Button
              variant="danger"
              size="md"
              type="button"
              style={{ width: '100%' }}
              loading={deletingTickets}
              onClick={() => {
                void deleteSelectedTickets().then(() => setMobileToolsOpen(false))
              }}
            >
              מחק נבחרים ({selectedTicketIds.size})
            </Button>
          )}
          <Button
            variant="danger"
            size="md"
            type="button"
            style={{ width: '100%' }}
            loading={deletingTickets}
            disabled={stats.total === 0}
            onClick={() => {
              void deleteAllTickets().then(() => setMobileToolsOpen(false))
            }}
          >
            מחק הכל
          </Button>
        </div>
      </Drawer>

      {isMobile && (
        <div style={{ padding: '12px 20px 0', display: 'flex', justifyContent: 'flex-start' }}>
          <Button variant="primary" size="md" onClick={() => setShowAddTicketModal(true)}>
            תקלה חדשה
          </Button>
        </div>
      )}

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
            title="תקלות"
            subtitle="ניהול ומעקב אחר תקלות אחזקה"
            actions={
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <Button
                  variant="danger"
                  size="sm"
                  loading={deletingTickets}
                  disabled={stats.total === 0}
                  onClick={() => void deleteAllTickets()}
                >
                  מחק הכל
                </Button>
                <Button variant="primary" onClick={() => setShowAddTicketModal(true)}>
                  תקלה חדשה
                </Button>
              </div>
            }
          />
        )}

        {/* KPI Cards */}
        <div style={{
          ...styles.kpiGrid,
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)',
        }}>
          <KpiCard label="סה״כ פעילות" value={stats.total} accent="primary" />
          <KpiCard label="פתוחות" value={stats.open} accent="warning" />
          <KpiCard label="בטיפול" value={stats.assigned} accent="primary" />
        </div>

        <p style={styles.closedHint}>
          תקלות סגורות מופיעות בהיסטוריית הפרויקט ובדוח הסיכום — לא ברשימה זו.
        </p>

        {ticketsTruncated && (
          <div style={{
            background: '#FFF4E5',
            border: '1.5px solid #FF9500',
            borderRadius: '10px',
            padding: '10px 16px',
            fontSize: '13px',
            color: '#7D4700',
            marginBottom: '12px',
            direction: 'rtl',
          }}>
            ⚠️ מציג עד 300 תקלות פעילות אחרונות. תקלות סגורות — בהיסטוריית פרויקט או בדוח סיכום.
          </div>
        )}

        {/* Filters: desktop = full toolbar; mobile = search + one drawer for filters/export */}
        <Card noPadding>
          {isMobile ? (
            <div
              style={{
                ...styles.filtersRow,
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: '12px',
                padding: '14px 16px',
              }}
            >
              <SearchInput
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="חיפוש תקלות..."
                style={{ width: '100%', maxWidth: 'none' }}
              />
              <div style={styles.chipRow}>
                {MOBILE_QUICK_STATUS_CHIPS.map((chip) => (
                  <button
                    key={chip.value}
                    type="button"
                    onClick={() => applyMobileQuickChip(chip.value)}
                    style={{
                      ...styles.chip,
                      ...(isMobileQuickChipActive(chip.value) ? styles.chipActive : {}),
                    }}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              <Button
                variant="secondary"
                size="md"
                type="button"
                onClick={() => setMobileToolsOpen(true)}
                style={{ width: '100%' }}
              >
                סינון וייצוא לאקסל
                {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </Button>
            </div>
          ) : (
            <div style={{
              ...styles.filtersRow,
              flexDirection: 'row',
            }}>
              <SearchInput
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="חיפוש תקלות..."
                style={{ flex: 1, maxWidth: '320px' }}
              />
              <Button variant="secondary" size="sm" type="button" onClick={exportToExcel}>
                ייצוא Excel
              </Button>
              {selectedTicketIds.size > 0 && (
                <Button
                  variant="danger"
                  size="sm"
                  type="button"
                  loading={deletingTickets}
                  onClick={() => void deleteSelectedTickets()}
                >
                  מחק נבחרים ({selectedTicketIds.size})
                </Button>
              )}
              <Button
                variant="danger"
                size="sm"
                type="button"
                loading={deletingTickets}
                disabled={stats.total === 0}
                onClick={() => void deleteAllTickets()}
              >
                מחק הכל
              </Button>
              <div style={{
                ...styles.filterGroup,
                flexWrap: 'nowrap',
              }}>
                <Select
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={statusOptions}
                  style={{ minWidth: '140px' }}
                />
                <Select
                  value={priorityFilter}
                  onChange={setPriorityFilter}
                  options={priorityOptions}
                  style={{ minWidth: '130px' }}
                />
                <Select
                  value={projectFilter}
                  onChange={setProjectFilter}
                  options={projectOptions}
                  style={{ minWidth: '140px' }}
                />
                <Select
                  value={workerFilter}
                  onChange={setWorkerFilter}
                  options={workerOptions}
                  style={{ minWidth: '140px' }}
                />
              </div>
            </div>
          )}

          {selectedTicketIds.size > 0 && isMobile && (
            <div
              style={{
                display: 'flex',
                gap: '10px',
                padding: '12px 16px',
                borderBottom: `1px solid ${theme.colors.border}`,
                flexWrap: 'wrap',
              }}
            >
              <Button
                variant="danger"
                size="sm"
                loading={deletingTickets}
                onClick={() => void deleteSelectedTickets()}
              >
                מחק נבחרים ({selectedTicketIds.size})
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setSelectedTicketIds(new Set())}>
                בטל בחירה
              </Button>
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div style={styles.loadingContainer}>
              <PageListSkeleton rows={10} />
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
                <LoadingSpinner />
              </div>
            </div>
          ) : filteredTickets.length === 0 ? (
            <EmptyState
              title="לא נמצאו תקלות"
              description="נסו לשנות מסננים או לפתוח תקלה חדשה."
              action={
                <Button variant="primary" onClick={() => setShowAddTicketModal(true)}>
                  תקלה חדשה
                </Button>
              }
            />
          ) : isMobile ? (
            <div style={styles.mobileCardList}>
              {filteredTickets.map((ticket) => (
                <TicketMobileCard
                  key={ticket.id}
                  ticket={ticket}
                  workerName={getWorkerName(ticket.assigned_worker_id)}
                  selected={selectedTicket?.id === ticket.id}
                  onClick={() => openTicket(ticket)}
                />
              ))}
            </div>
          ) : (
            <div style={styles.tableContainer}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={{ ...styles.th, width: 44 }}>
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAllFiltered}
                        aria-label="בחר הכל ברשימה המסוננת"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </th>
                    <th style={styles.th}>#</th>
                    <th style={styles.th}>עדיפות</th>
                    <th style={styles.th}>בניין</th>
                    <th style={styles.th}>תיאור</th>
                    <th style={styles.th}>סטטוס</th>
                    <th style={styles.th}>משויך</th>
                    <th style={styles.th}>גיל</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTickets.map((ticket) => (
                    <tr
                      key={ticket.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`פתח תקלה ${ticket.ticket_number}`}
                      style={{
                        ...styles.tr,
                        ...(selectedTicketIds.has(ticket.id)
                          ? { background: theme.colors.primaryMuted }
                          : {}),
                      }}
                      onClick={() => openTicket(ticket)}
                      onKeyDown={(e) => handleTicketRowKeyDown(e, ticket)}
                    >
                      <td style={styles.td} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedTicketIds.has(ticket.id)}
                          onChange={(e) => toggleTicketSelection(ticket.id, e)}
                          aria-label={`בחר תקלה ${ticket.ticket_number}`}
                        />
                      </td>
                      <td style={styles.td}>
                        <span style={styles.ticketNumber}>{ticket.ticket_number}</span>
                      </td>
                      <td style={styles.td}>
                        <PriorityDot priority={ticket.priority || 'LOW'} />
                      </td>
                      <td style={styles.td}>
                        <span style={styles.projectBadge}>{ticket.project_name || ticket.project_code}</span>
                      </td>
                      <td style={{ ...styles.td, maxWidth: '350px' }}>
                        <span style={styles.descriptionText}>
                          {ticket.description?.slice(0, 80)}{(ticket.description?.length || 0) > 80 ? '...' : ''}
                        </span>
                      </td>
                      <td style={styles.td}>
                        <StatusBadge status={ticket.status} size="sm" />
                      </td>
                      <td style={styles.td}>
                        <span style={styles.workerName}>{getWorkerName(ticket.assigned_worker_id)}</span>
                      </td>
                      <td style={styles.td}>
                        <span style={styles.ageText}>{getTicketAge(ticket.created_at)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Ticket Detail Drawer */}
      <Drawer
        open={!!selectedTicket}
        onClose={closeDrawer}
        title={selectedTicket ? `תקלה #${selectedTicket.ticket_number}` : ''}
        subtitle={selectedTicket?.project_name || selectedTicket?.project_code}
        isMobile={isMobile}
      >
        {selectedTicket && (
          <div style={styles.drawerContent}>
            {/* Tabs */}
            <div style={styles.tabBar}>
              <button
                style={{ ...styles.tab, ...(activeDetailTab === 'details' ? styles.tabActive : styles.tabInactive) }}
                onClick={() => setActiveDetailTab('details')}
              >
                פרטים
              </button>
              <button
                style={{ ...styles.tab, ...(activeDetailTab === 'chat' ? styles.tabActive : styles.tabInactive) }}
                onClick={() => setActiveDetailTab('chat')}
              >
                צ׳אט פנימי
              </button>
            </div>

            {activeDetailTab === 'chat' && (
              <TicketChat ticketId={selectedTicket.id} clientId={tenantClientId || selectedTicket.client_id || null} />
            )}

            {activeDetailTab === 'details' && (<>
            <div style={styles.formGroup}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <label style={styles.formLabel}>תיאור</label>
                <Button variant="secondary" size="sm" type="button" loading={translating} onClick={translateDescription}>
                  תרגם לעברית
                </Button>
              </div>
              <div style={styles.descriptionBox}>{selectedTicket.description || '-'}</div>
              {descriptionTranslation ? (
                <div style={{ ...styles.descriptionBox, marginTop: '10px', borderInlineStart: `3px solid ${theme.colors.primary}` }}>
                  <div style={{ fontSize: '12px', color: theme.colors.textMuted, marginBottom: '6px' }}>תרגום</div>
                  {descriptionTranslation}
                </div>
              ) : null}
            </div>

            {selectedTicket.status !== 'CLOSED' && (
              <div style={styles.formGroup}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <label style={styles.formLabel}>מיזוג תקלות</label>
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    loading={mergeLoading}
                    onClick={() => loadMergeCandidates(selectedTicket)}
                  >
                    טען תקלות פתוחות מאותו בניין
                  </Button>
                </div>
                {mergeCandidates.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                    {mergeCandidates.map((c) => (
                      <div
                        key={c.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '10px 12px',
                          background: theme.colors.muted,
                          borderRadius: theme.radius.md,
                        }}
                      >
                        <span style={{ fontSize: '14px' }}>
                          #{c.ticket_number} — {(c.description || '').slice(0, 60)}
                          {(c.description?.length || 0) > 60 ? '…' : ''}
                        </span>
                        <Button variant="primary" size="sm" type="button" onClick={() => runMerge(c.id)} loading={savingTicket}>
                          מזג לכאן
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>מדווח</label>
                <div style={styles.formValue}>
                  {selectedTicket.reporter_name || selectedTicket.reporter_phone || '-'}
                </div>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>נוצר</label>
                <div style={styles.formValue}>
                  {selectedTicket.created_at ? new Date(selectedTicket.created_at).toLocaleDateString() : '-'}
                </div>
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>עדיפות</label>
              <Select
                value={draftPriority}
                onChange={setDraftPriority}
                options={[
                  { label: 'נמוכה', value: 'LOW' },
                  { label: 'בינונית', value: 'MEDIUM' },
                  { label: 'גבוהה', value: 'HIGH' },
                  { label: 'דחופה', value: 'URGENT' },
                ]}
                style={{ width: '100%' }}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>סטטוס</label>
              <Select
                value={draftStatus}
                onChange={setDraftStatus}
                options={statusOptions.filter(s => s.value !== 'ALL')}
                style={{ width: '100%' }}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>משויך לעובד</label>
              <Select
                value={draftWorkerId}
                onChange={setDraftWorkerId}
                options={[
                  { label: 'לא משויך', value: '' },
                  ...workers.map((w) => ({ label: w.full_name, value: w.id })),
                ]}
                style={{ width: '100%' }}
              />
            </div>

            <ForwardToProfessionalBlock
              ticketId={selectedTicket.id}
              professionals={professionals}
              onForwarded={async () => {
                await fetchData(true)
                if (selectedTicket && draftStatus !== 'PROFESSIONAL_ESCORT') {
                  setDraftStatus('PROFESSIONAL_ESCORT')
                }
              }}
            />

            {/* Attachments */}
            {selectedTicketAttachments.length > 0 && (
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>קבצים מצורפים</label>
                <div style={styles.attachmentGrid}>
                  {selectedTicketAttachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      style={{
                        ...styles.attachmentItem,
                        cursor: attachment.mime_type?.startsWith('image/') ? 'pointer' : 'default',
                      }}
                      onClick={() => {
                        if (attachment.mime_type?.startsWith('image/') && attachment.signed_url) {
                          setLightboxImage(attachment.signed_url)
                        }
                      }}
                    >
                      <TicketAttachmentThumb
                        mimeType={attachment.mime_type}
                        url={attachment.signed_url || ''}
                        fileName={attachment.file_name}
                        imageStyle={styles.attachmentImage}
                        videoStyle={styles.attachmentVideo}
                        fileStyle={styles.attachmentFile}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={styles.drawerActions}>
              <Button variant="secondary" onClick={closeDrawer}>
                ביטול
              </Button>
              <Button variant="danger" onClick={() => void deleteSingleTicket()} loading={deletingTickets}>
                מחק תקלה
              </Button>
              {selectedTicket.status !== 'CLOSED' && (
                <Button variant="danger" onClick={() => void handleCloseTicket()} loading={savingTicket}>
                  סגירת תקלה
                </Button>
              )}
              <Button variant="primary" onClick={saveTicketChanges} loading={savingTicket}>
                שמירה
              </Button>
            </div>
            </>)}
          </div>
        )}
      </Drawer>

      {/* Add Ticket Modal */}
      <Drawer
        open={showAddTicketModal}
        onClose={() => setShowAddTicketModal(false)}
        title="תקלה חדשה"
        subtitle="פתיחת פניית אחזקה"
        isMobile={isMobile}
      >
        <form onSubmit={handleCreateTicket} style={styles.drawerContent}>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>פרויקט *</label>
            <Select
              value={addTicketForm.project_code}
              onChange={(value) => setAddTicketForm((prev) => ({ ...prev, project_code: value }))}
              options={[
                { label: 'בחרו פרויקט', value: '' },
                ...projects.map((p) => ({ label: p.name, value: p.project_code })),
              ]}
              style={{ width: '100%' }}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>תיאור *</label>
            <textarea
              value={addTicketForm.description}
              onChange={(e) => setAddTicketForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="תיאור התקלה..."
              style={styles.textarea}
              rows={4}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>שם מדווח</label>
            <input
              type="text"
              value={addTicketForm.reporter_name}
              onChange={(e) => setAddTicketForm((prev) => ({ ...prev, reporter_name: e.target.value }))}
              placeholder="אופציונלי"
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>טלפון מדווח</label>
            <input
              type="tel"
              value={addTicketForm.reporter_phone}
              onChange={(e) => setAddTicketForm((prev) => ({ ...prev, reporter_phone: e.target.value }))}
              placeholder="אופציונלי"
              style={styles.input}
            />
          </div>

          {addTicketError && (
            <p style={styles.errorText}>{addTicketError}</p>
          )}

          <div style={styles.drawerActions}>
            <Button variant="secondary" type="button" onClick={() => setShowAddTicketModal(false)}>
              ביטול
            </Button>
            <Button variant="primary" type="submit" loading={addingTicket}>
              יצירת תקלה
            </Button>
          </div>
        </form>
      </Drawer>

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

      <ImageLightbox imageUrl={lightboxImage} onClose={() => setLightboxImage(null)} />
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
    marginBottom: '12px',
  },
  closedHint: {
    fontSize: '13px',
    color: theme.colors.textMuted,
    margin: '0 0 16px',
    lineHeight: 1.45,
  },
  chipRow: {
    display: 'flex',
    gap: '8px',
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    paddingBottom: '2px',
  },
  chip: {
    flex: '0 0 auto',
    padding: '8px 14px',
    minHeight: '36px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    color: theme.colors.textSecondary,
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  chipActive: {
    borderColor: theme.colors.primary,
    background: theme.colors.primaryMuted,
    color: theme.colors.primary,
  },
  mobileCardList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '12px 16px 20px',
  },
  filtersRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '20px 24px',
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  loadingContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '64px 0',
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
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
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
  ticketNumber: {
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  projectBadge: {
    fontSize: '12px',
    fontWeight: 500,
    color: theme.colors.textMuted,
    background: theme.colors.muted,
    padding: '4px 8px',
    borderRadius: theme.radius.sm,
  },
  descriptionText: {
    color: theme.colors.textSecondary,
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  workerName: {
    color: theme.colors.textSecondary,
  },
  ageText: {
    color: theme.colors.textMuted,
    fontSize: '13px',
  },
  drawerContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  tabBar: {
    display: 'flex',
    gap: '4px',
    padding: '4px',
    background: theme.colors.muted,
    borderRadius: theme.radius.md,
  },
  tab: {
    flex: 1,
    padding: '8px 0',
    fontSize: '14px',
    fontWeight: 500,
    border: 'none',
    borderRadius: theme.radius.sm,
    cursor: 'pointer',
    transition: 'all 0.15s',
    fontFamily: 'inherit',
  },
  tabActive: {
    background: theme.colors.surface,
    color: theme.colors.primary,
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  tabInactive: {
    background: 'transparent',
    color: theme.colors.textMuted,
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
  },
  formLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: theme.colors.textSecondary,
  },
  formValue: {
    fontSize: '15px',
    color: theme.colors.textPrimary,
  },
  descriptionBox: {
    padding: '14px',
    background: theme.colors.muted,
    borderRadius: theme.radius.md,
    fontSize: '14px',
    color: theme.colors.textPrimary,
    lineHeight: 1.6,
  },
  attachmentGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '12px',
  },
  attachmentItem: {
    display: 'block',
    borderRadius: theme.radius.md,
    overflow: 'hidden',
    border: `1px solid ${theme.colors.border}`,
    cursor: 'pointer',
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
  },
  attachmentImage: {
    width: '100%',
    height: '80px',
    objectFit: 'cover',
  },
  attachmentVideo: {
    width: '100%',
    height: '120px',
    objectFit: 'cover',
    display: 'block',
    background: '#000',
  },
  attachmentFile: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    padding: '16px 8px',
    background: theme.colors.muted,
  },
  attachmentName: {
    fontSize: '11px',
    color: theme.colors.textMuted,
    textAlign: 'center',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '100%',
  },
  drawerActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    paddingTop: '16px',
    borderTop: `1px solid ${theme.colors.border}`,
    marginTop: '8px',
  },
  textarea: {
    padding: '12px 14px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    fontSize: '15px',
    color: theme.colors.textPrimary,
    resize: 'vertical',
    minHeight: '100px',
    fontFamily: 'inherit',
  },
  input: {
    padding: '12px 14px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    fontSize: '15px',
    color: theme.colors.textPrimary,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: '14px',
    margin: 0,
  },
}
