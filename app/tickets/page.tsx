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
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'
import { resolveBamakorClientIdForBrowser } from '@/lib/bamakor-client'
import { withClientId } from '@/lib/supabase/with-client-id'
import { toast, asyncHandler } from '@/lib/error-handler'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { TM } from '@/lib/toast-messages'
import {
  toastReporterClosedNotifyNetworkWarning,
  toastReporterClosedNotifySummary,
  type ReporterClosedNotifyApiBody,
} from '@/lib/reporter-closed-notify-toast'
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
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { PageListSkeleton } from '../components/page-skeleton'
import { TicketChat } from '../components/tickets/TicketChat'

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

const statusOptions = [
  { label: 'כל הסטטוסים', value: 'ALL' },
  { label: 'חדש', value: 'NEW' },
  { label: 'משויך', value: 'ASSIGNED' },
  { label: 'בטיפול', value: 'IN_PROGRESS' },
  { label: 'ממתין לחלקים', value: 'WAITING_PARTS' },
  { label: 'סגור', value: 'CLOSED' },
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
    const key = `bamakor_tickets_v1_${clientId}`
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as TicketsCache
    if (Date.now() - parsed.savedAt > TICKETS_CACHE_TTL_MS) return null
    return parsed
  } catch { return null }
}

function writeTicketsCache(clientId: string, data: Omit<TicketsCache, 'savedAt'>) {
  try {
    const key = `bamakor_tickets_v1_${clientId}`
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
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [priorityFilter, setPriorityFilter] = useState('ALL')
  const [projectFilter, setProjectFilter] = useState('ALL')
  const [workerFilter, setWorkerFilter] = useState('ALL')
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<TicketRow | null>(null)
  const [draftPriority, setDraftPriority] = useState<string>('')
  const [draftStatus, setDraftStatus] = useState<string>('')
  const [draftWorkerId, setDraftWorkerId] = useState<string>('')
  const [savingTicket, setSavingTicket] = useState(false)
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
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('project')) setProjectFilter(decodeURIComponent(params.get('project')!))
      if (params.get('worker')) setWorkerFilter(decodeURIComponent(params.get('worker')!))
      if (params.get('status')) setStatusFilter(decodeURIComponent(params.get('status')!))
      if (params.get('priority')) setPriorityFilter(decodeURIComponent(params.get('priority')!))
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
        const [ticketsResult, workersResult, projectsResult] = await Promise.all([
          withClientId(supabase.from('tickets').select(TICKETS_LIST_SELECT), clientId)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(300),
          withClientId(supabase.from('workers').select('id, full_name, phone, email, role, is_active'), clientId)
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
        setProjects((projectsResult.data as ProjectRow[]) || [])
        writeTicketsCache(clientId, {
          tickets: normalizedTickets,
          workers: (workersResult.data as WorkerRow[]) || [],
          projects: (projectsResult.data as ProjectRow[]) || [],
          ticketsTruncated: normalizedTickets.length >= 300,
        })
        return true
      },
      { context: 'טעינת תקלות', showErrorToast: true }
    )
    if (!silent) setLoading(false)
  }, [])

  useEffect(() => {
    void (async () => {
      const clientId = await resolveBamakorClientIdForBrowser()
      const cached = readTicketsCache(clientId)
      if (cached) {
        setTickets(cached.tickets)
        setWorkers(cached.workers)
        setProjects(cached.projects)
        setTicketsTruncated(cached.ticketsTruncated)
        setLoading(false)
        void fetchData(true)
      } else {
        void fetchData()
      }
    })()
    const interval = setInterval(() => void fetchData(true), 10 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchData])

  // Visibility API — silent refresh when returning to tab
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void fetchData(true)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchData])

  const stats = useMemo(() => {
    const total = tickets.length
    const open = tickets.filter((t) => t.status === 'NEW').length
    const assigned = tickets.filter((t) => t.status === 'ASSIGNED' || t.status === 'IN_PROGRESS').length
    const resolved = tickets.filter((t) => t.status === 'CLOSED').length
    return { total, open, assigned, resolved }
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

  function getWorkerName(workerId?: string | null) {
    if (!workerId) return 'לא משויך'
    const worker = workers.find((w) => w.id === workerId)
    return worker?.full_name || 'לא ידוע'
  }

  const statusLabelHe: Record<string, string> = {
    NEW: 'חדש',
    ASSIGNED: 'משויך',
    IN_PROGRESS: 'בטיפול',
    WAITING_PARTS: 'ממתין לחלקים',
    CLOSED: 'סגור',
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
      'סטטוס': statusLabelHe[t.status] || t.status,
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

  async function loadTicketAttachments(ticketId: string) {
    setLoadingAttachments(true)
    try {
      const { data } = await supabase
        .from('ticket_attachments')
        .select('id, ticket_id, file_name, file_url, mime_type, attachment_type, whatsapp_media_id, created_at')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: false })

      if (data && data.length > 0) {
        const attachmentsWithUrls = data.map((attachment: AttachmentRow) => {
          // Get public URL - bucket is PUBLIC so no signed URL needed
          const filePath = attachment.file_url || ''
          const { data: publicUrlData } = supabase.storage
            .from('ticket-attachments')
            .getPublicUrl(filePath)
          return { ...attachment, signed_url: publicUrlData?.publicUrl || null }
        })
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
      // Handle worker assignment if changed
      let didAssign = false
      if (draftWorkerId && draftWorkerId !== selectedTicket.assigned_worker_id) {
        const assignRes = await fetchWithTimeout('/api/assign-ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticket_id: selectedTicket.id, worker_id: draftWorkerId }),
        })
        const assignBody = (await assignRes.json().catch(() => ({}))) as {
          error?: string
          worker_sms_sent?: boolean | null
          worker_sms_note?: string
        }
        if (!assignRes.ok) {
          throw new Error(assignBody.error || 'שיוך לעובד נכשל')
        }
        if ((assignBody.worker_sms_sent === false || assignBody.worker_sms_sent === null) && assignBody.worker_sms_note) {
          toast.error(assignBody.worker_sms_note)
        }
        didAssign = true
      }

      const payload: Record<string, string | null> = {
        priority: draftPriority,
        status: draftStatus,
        assigned_worker_id: draftWorkerId || null,
      }
      if (draftStatus === 'CLOSED') {
        payload.closed_at = new Date().toISOString()
      } else {
        payload.closed_at = null
      }

      const saveCid =
        tenantClientId ||
        selectedTicket.client_id ||
        (await resolveBamakorClientIdForBrowser())
      const { error } = await withClientId(
        supabase.from('tickets').update(payload),
        saveCid
      )
        .eq('id', selectedTicket.id)
        .is('deleted_at', null)

      if (error) throw error

      const closedNow = draftStatus === 'CLOSED' && selectedTicket.status !== 'CLOSED'

      if (closedNow) toast.success(TM.ticketClosed)
      else if (didAssign) toast.success(TM.workerAssigned)
      else toast.success(TM.ticketUpdated)

      if (closedNow) {
        try {
          const nRes = await fetchWithTimeout('/api/notify-reporter-ticket-closed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticket_id: selectedTicket.id }),
          })
          const nBody = (await nRes.json().catch(() => ({}))) as ReporterClosedNotifyApiBody
          if (!nRes.ok) {
            toastReporterClosedNotifyNetworkWarning()
          } else {
            toastReporterClosedNotifySummary(nBody)
          }
        } catch {
          toastReporterClosedNotifyNetworkWarning()
        }
      }

      await fetchData()
      setSelectedTicket((prev) => prev ? { ...prev, priority: draftPriority, status: draftStatus, assigned_worker_id: draftWorkerId || null } : prev)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : TM.genericSaveError)
    }
    setSavingTicket(false)
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
              <Button variant="primary" onClick={() => setShowAddTicketModal(true)}>
                תקלה חדשה
              </Button>
            }
          />
        )}

        {/* KPI Cards */}
        <div style={{
          ...styles.kpiGrid,
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        }}>
          <KpiCard label="סה״כ תקלות" value={stats.total} accent="primary" />
          <KpiCard label="פתוחות" value={stats.open} accent="warning" />
          <KpiCard label="בטיפול" value={stats.assigned} accent="primary" />
          <KpiCard label="נסגרו" value={stats.resolved} accent="success" />
        </div>

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
            ⚠️ מציג 300 תקלות אחרונות בלבד. להצגת תקלות ישנות יותר, השתמש בייצוא לאקסל.
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
          ) : (
            <div style={styles.tableContainer}>
              <table style={styles.table}>
                <thead>
                  <tr>
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
                      style={styles.tr}
                      onClick={() => openTicket(ticket)}
                    >
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

            {/* Attachments */}
            {selectedTicketAttachments.length > 0 && (
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>קבצים מצורפים</label>
                <div style={styles.attachmentGrid}>
                  {selectedTicketAttachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      style={styles.attachmentItem}
                      onClick={() => {
                        if (attachment.signed_url) {
                          setLightboxImage(attachment.signed_url)
                        }
                      }}
                    >
                      {attachment.mime_type?.startsWith('image/') ? (
                        <img
                          src={attachment.signed_url || ''}
                          alt={attachment.file_name || 'attachment'}
                          style={styles.attachmentImage}
                          crossOrigin="anonymous"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div style={styles.attachmentFile}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textMuted} strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                          <span style={styles.attachmentName}>{attachment.file_name}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={styles.drawerActions}>
              <Button variant="secondary" onClick={closeDrawer}>
                ביטול
              </Button>
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

      {/* Image Lightbox */}
      {lightboxImage && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setLightboxImage(null)}
        >
          <button
            onClick={() => setLightboxImage(null)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '50%',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: '#fff',
              fontSize: '24px',
            }}
          >
            &times;
          </button>
          <img
            src={lightboxImage}
            alt="Attachment"
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              borderRadius: '8px',
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
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
