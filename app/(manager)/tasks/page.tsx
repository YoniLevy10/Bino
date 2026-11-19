'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Card,
  Drawer,
  EmptyState,
  FilterTabs,
  LoadingSpinner,
  MobileHeader,
  PageHeader,
  theme,
  useMobileMenu,
} from '@/app/components/ui'
import {
  fetchWithTimeout,
  MUTATION_FETCH_TIMEOUT_MS,
  WORKER_PHOTO_TIMEOUT_MS,
} from '@/lib/fetch-with-timeout'
import { toast } from '@/lib/error-handler'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { isMaintenanceTaskForToday } from '@/lib/maintenance-task-day'
import {
  MAINTENANCE_CADENCES,
  MAINTENANCE_CADENCE_LABELS,
  cadenceColor,
  cadenceLabel,
  morningBucket,
  type MaintenanceCadence,
} from '@/lib/maintenance-cadence'
import { resolveBinoClientIdForBrowser } from '@/lib/bamakor-client'
import { queryKeys } from '@/lib/query-keys'
import {
  normalizeChecklistItems,
  type MaintenanceChecklistItem,
} from '@/lib/maintenance-checklist'
import { TasksWeekBoard } from '@/app/components/tasks/TasksWeekBoard'
import { TasksTemplatesBar } from '@/app/components/tasks/TasksTemplatesBar'
import { buildingAssetPublicUrl } from '@/lib/building-asset-public'

type TaskRow = {
  id: string
  title: string
  description: string | null
  priority: string
  status: string
  due_at: string | null
  notes: string | null
  cadence?: string | null
  calendar_event_id?: string | null
  series_id?: string | null
  checklist_items?: MaintenanceChecklistItem[] | null
  estimated_minutes?: number | null
  actual_cost_ils?: number | null
  asset_id?: string | null
  project_id: string | null
  assigned_worker_id: string | null
  source_ticket_id?: string | null
  projects?: { name?: string | null; address?: string | null } | { name?: string | null; address?: string | null }[] | null
  workers?: { full_name?: string | null; hourly_rate?: number | null } | { full_name?: string | null; hourly_rate?: number | null }[] | null
  tickets?:
    | { id?: string | null; ticket_number?: number | null }
    | { id?: string | null; ticket_number?: number | null }[]
    | null
}

type TaskAttachment = {
  id: string
  file_name: string
  public_url: string | null
  mime_type: string | null
}

type WorkerOpt = { id: string; full_name: string }
type ProjectOpt = { id: string; name: string }

type ListFilter = 'morning' | 'open' | 'today' | 'all' | 'week'

const PRIORITY_LABEL: Record<string, string> = {
  LOW: 'נמוכה',
  MEDIUM: 'בינונית',
  HIGH: 'גבוהה',
  URGENT: 'דחופה',
}

function relName(row: TaskRow): string {
  const w = Array.isArray(row.workers) ? row.workers[0] : row.workers
  return w?.full_name || 'לא משויך'
}

function projectName(row: TaskRow): string {
  const p = Array.isArray(row.projects) ? row.projects[0] : row.projects
  return p?.name || 'ללא בניין'
}

function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function Field({
  label,
  children,
  hint,
  full,
}: {
  label: string
  children: ReactNode
  hint?: string
  full?: boolean
}) {
  return (
    <label style={{ ...styles.field, ...(full ? { gridColumn: '1 / -1' } : {}) }}>
      <span style={styles.fieldLabel}>{label}</span>
      {children}
      {hint ? <span style={styles.fieldHint}>{hint}</span> : null}
    </label>
  )
}

const emptyForm = {
  title: '',
  description: '',
  notes: '',
  projectId: '',
  workerId: '',
  priority: 'MEDIUM',
  dueAt: '',
  cadence: 'one_off' as MaintenanceCadence,
  sourceTicketId: '',
  sourceTicketNumber: '',
  checklist: [] as MaintenanceChecklistItem[],
  checklistDraft: '',
  estimatedMinutes: '' as string,
  actualCostIls: '' as string,
  assetId: '',
}

function ticketLinkMeta(row: TaskRow): { id: string; number: number | null } | null {
  const ticketId = row.source_ticket_id?.trim()
  if (!ticketId) return null
  const t = Array.isArray(row.tickets) ? row.tickets[0] : row.tickets
  const num = typeof t?.ticket_number === 'number' ? t.ticket_number : null
  return { id: ticketId, number: num }
}

type MaintenanceTasksPayload = {
  tasks: TaskRow[]
  workers: WorkerOpt[]
  projects: ProjectOpt[]
  attachments_by_task: Record<string, TaskAttachment[]>
  has_more: boolean
}

const TASKS_PAGE_SIZE = 100

function apiFilterForList(listFilter: ListFilter): 'open' | 'all' {
  return listFilter === 'all' ? 'all' : 'open'
}

/** DoD: morning tab shows overdue/today/week with cadence colors — see FilterTabs «בוקר». */

async function fetchMaintenanceTasksPage(
  filter: 'open' | 'all',
  offset: number
): Promise<MaintenanceTasksPayload> {
  const params = new URLSearchParams({
    limit: String(TASKS_PAGE_SIZE),
    offset: String(offset),
    filter,
  })
  const tasksRes = await fetchWithTimeout(`/api/maintenance-tasks?${params}`)
  if (!tasksRes.ok) throw new Error('טעינת משימות נכשלה')
  const json = (await tasksRes.json()) as {
    tasks?: TaskRow[]
    workers?: WorkerOpt[]
    projects?: ProjectOpt[]
    attachments_by_task?: Record<string, TaskAttachment[]>
    has_more?: boolean
  }
  return {
    tasks: json.tasks || [],
    workers: json.workers || [],
    projects: json.projects || [],
    attachments_by_task: json.attachments_by_task || {},
    has_more: Boolean(json.has_more),
  }
}

export default function TasksPage() {
  const queryClient = useQueryClient()
  const [isMobile, setIsMobile] = useState(false)
  const { openMenu } = useMobileMenu()
  const [saving, setSaving] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<TaskRow | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [listFilter, setListFilter] = useState<ListFilter>('morning')
  const [groupByWorker, setGroupByWorker] = useState(false)
  const [attachmentsByTask, setAttachmentsByTask] = useState<Record<string, TaskAttachment[]>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const createFileRef = useRef<HTMLInputElement | null>(null)
  const editFileRef = useRef<HTMLInputElement | null>(null)
  const [createFile, setCreateFile] = useState<File | null>(null)
  const [extraTasks, setExtraTasks] = useState<TaskRow[]>([])
  const [hasMoreTasks, setHasMoreTasks] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [assets, setAssets] = useState<
    Array<{ id: string; name: string; project_id: string; public_slug?: string | null }>
  >([])
  const [suggestBusy, setSuggestBusy] = useState(false)

  const clientIdQuery = useQuery({
    queryKey: ['tenant-client-id'],
    queryFn: () => resolveBinoClientIdForBrowser(),
    staleTime: 5 * 60_000,
  })
  const clientId = clientIdQuery.data
  const apiFilter = apiFilterForList(listFilter)

  const tasksQuery = useQuery({
    queryKey: clientId
      ? queryKeys.maintenanceTasks(clientId, apiFilter, TASKS_PAGE_SIZE, 0)
      : ['maintenance-tasks', 'pending'],
    queryFn: () => fetchMaintenanceTasksPage(apiFilter, 0),
    enabled: Boolean(clientId),
    staleTime: 30_000,
  })

  const baseTasks = tasksQuery.data?.tasks ?? []
  const workers = tasksQuery.data?.workers ?? []
  const projects = tasksQuery.data?.projects ?? []
  const tasks = useMemo(() => {
    if (extraTasks.length === 0) return baseTasks
    const seen = new Set(baseTasks.map((t) => t.id))
    return [...baseTasks, ...extraTasks.filter((t) => !seen.has(t.id))]
  }, [baseTasks, extraTasks])
  const loading = clientIdQuery.isLoading || (tasksQuery.isLoading && !tasksQuery.data)

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Recommendation / ticket-hub links: /tasks?create=1&project_id=&topic=&source_ticket_id=
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('create') !== '1') return
    const projectId = (params.get('project_id') || '').trim()
    const topic = (params.get('topic') || '').trim()
    const sourceTicketId = (params.get('source_ticket_id') || '').trim()
    const sourceTicketNumber = (params.get('ticket_number') || '').trim()
    const titleParam = (params.get('title') || '').trim()
    const descriptionParam = (params.get('description') || '').trim()
    setEditingTask(null)
    setForm({
      ...emptyForm,
      projectId,
      sourceTicketId,
      sourceTicketNumber,
      title:
        titleParam ||
        (topic ? `טיפול מונע — ${topic}` : '') ||
        (sourceTicketNumber ? `אחזקה — תקלה #${sourceTicketNumber}` : ''),
      description: descriptionParam,
    })
    setCreateFile(null)
    setDrawerOpen(true)
  }, [])

  useEffect(() => {
    setExtraTasks([])
    setHasMoreTasks(Boolean(tasksQuery.data?.has_more))
  }, [apiFilter, tasksQuery.dataUpdatedAt, tasksQuery.data?.has_more])

  useEffect(() => {
    const fromApi = tasksQuery.data?.attachments_by_task
    if (!fromApi) return
    setAttachmentsByTask((prev) => ({ ...fromApi, ...prev }))
  }, [tasksQuery.data?.attachments_by_task])

  const loadAttachments = useCallback(async (taskId: string) => {
    try {
      const res = await fetchWithTimeout(
        `/api/maintenance-tasks/attachments?task_id=${encodeURIComponent(taskId)}`
      )
      if (!res.ok) return
      const json = (await res.json()) as { attachments?: TaskAttachment[] }
      setAttachmentsByTask((prev) => ({ ...prev, [taskId]: json.attachments || [] }))
    } catch {
      /* ignore */
    }
  }, [])

  const load = useCallback(async () => {
    setExtraTasks([])
    if (clientId) {
      await queryClient.invalidateQueries({ queryKey: ['maintenance-tasks', clientId] })
    } else {
      await tasksQuery.refetch()
    }
  }, [clientId, queryClient, tasksQuery])

  async function loadMoreTasks() {
    if (loadingMore || !hasMoreTasks) return
    setLoadingMore(true)
    try {
      const page = await fetchMaintenanceTasksPage(apiFilter, tasks.length)
      setExtraTasks((prev) => [...prev, ...page.tasks])
      setHasMoreTasks(page.has_more)
      setAttachmentsByTask((prev) => ({ ...page.attachments_by_task, ...prev }))
    } catch {
      toast.error('טעינת משימות נוספות נכשלה')
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => {
    if (tasksQuery.isError) {
      toast.error(tasksQuery.error instanceof Error ? tasksQuery.error.message : 'שגיאת חיבור')
    }
  }, [tasksQuery.isError, tasksQuery.error])

  const visible = useMemo(() => {
    if (listFilter === 'morning') {
      return tasks
        .filter((t) => t.status !== 'DONE')
        .filter((t) => {
          const b = morningBucket(t.due_at)
          return b === 'overdue' || b === 'today' || b === 'week'
        })
        .sort((a, b) => {
          const order = { overdue: 0, today: 1, week: 2, later: 3 } as const
          const ba = morningBucket(a.due_at) || 'later'
          const bb = morningBucket(b.due_at) || 'later'
          if (order[ba] !== order[bb]) return order[ba] - order[bb]
          return (a.due_at || '').localeCompare(b.due_at || '')
        })
    }
    if (listFilter === 'today') {
      return tasks.filter((t) => isMaintenanceTaskForToday({ dueAt: t.due_at, status: t.status }))
    }
    if (listFilter === 'all') return tasks
    return tasks.filter((t) => t.status !== 'DONE')
  }, [tasks, listFilter])

  const grouped = useMemo(() => {
    if (!groupByWorker) return [{ key: 'all', label: null as string | null, items: visible }]
    const map = new Map<string, { label: string; items: TaskRow[] }>()
    for (const t of visible) {
      const key = t.assigned_worker_id || 'unassigned'
      const label = relName(t)
      if (!map.has(key)) map.set(key, { label, items: [] })
      map.get(key)!.items.push(t)
    }
    return Array.from(map.entries()).map(([key, v]) => ({
      key,
      label: v.label,
      items: v.items,
    }))
  }, [visible, groupByWorker])

  function openCreate() {
    setEditingTask(null)
    setForm(emptyForm)
    setCreateFile(null)
    if (createFileRef.current) createFileRef.current.value = ''
    setDrawerOpen(true)
  }

  function openEdit(t: TaskRow) {
    const link = ticketLinkMeta(t)
    setEditingTask(t)
    setForm({
      title: t.title,
      description: t.description || '',
      notes: t.notes || '',
      projectId: t.project_id || '',
      workerId: t.assigned_worker_id || '',
      priority: t.priority || 'MEDIUM',
      dueAt: toLocalInput(t.due_at),
      cadence: (t.cadence as MaintenanceCadence) || 'one_off',
      sourceTicketId: link?.id || '',
      sourceTicketNumber: link?.number != null ? String(link.number) : '',
      checklist: normalizeChecklistItems(t.checklist_items),
      checklistDraft: '',
      estimatedMinutes: t.estimated_minutes != null ? String(t.estimated_minutes) : '',
      actualCostIls: t.actual_cost_ils != null ? String(t.actual_cost_ils) : '',
      assetId: t.asset_id || '',
    })
    setCreateFile(null)
    if (createFileRef.current) createFileRef.current.value = ''
    setDrawerOpen(true)
    if (t.project_id) void loadAssets(t.project_id)
  }

  async function loadAssets(projectId: string) {
    try {
      const res = await fetchWithTimeout(
        `/api/building-assets?project_id=${encodeURIComponent(projectId)}`
      )
      if (!res.ok) return
      const json = (await res.json()) as {
        assets?: Array<{ id: string; name: string; project_id: string; public_slug?: string | null }>
      }
      setAssets(json.assets || [])
    } catch {
      /* ignore */
    }
  }

  function closeDrawer() {
    setDrawerOpen(false)
    setEditingTask(null)
    setForm(emptyForm)
    setCreateFile(null)
  }

  function taskPayloadExtras() {
    const minutes = form.estimatedMinutes.trim()
      ? Number.parseInt(form.estimatedMinutes, 10)
      : null
    const cost = form.actualCostIls.trim() ? Number.parseFloat(form.actualCostIls) : null
    return {
      checklist_items: form.checklist,
      estimated_minutes: Number.isFinite(minutes) && minutes && minutes > 0 ? minutes : null,
      actual_cost_ils: Number.isFinite(cost as number) && (cost as number) >= 0 ? cost : null,
      asset_id: form.assetId || null,
    }
  }

  async function saveTask() {
    if (!form.title.trim()) {
      toast.error('נא למלא כותרת')
      return
    }
    setSaving(true)
    try {
      const extras = taskPayloadExtras()
      if (editingTask) {
        const res = await fetchWithTimeout(
          '/api/maintenance-tasks',
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              task_id: editingTask.id,
              title: form.title.trim(),
              description: form.description.trim() || null,
              notes: form.notes.trim() || null,
              project_id: form.projectId || null,
              assigned_worker_id: form.workerId || null,
              priority: form.priority,
              due_at: form.dueAt ? new Date(form.dueAt).toISOString() : null,
              cadence: form.cadence,
              sync_to_calendar: true,
              source_ticket_id: form.sourceTicketId || null,
              ...extras,
            }),
          },
          MUTATION_FETCH_TIMEOUT_MS
        )
        if (!res.ok) {
          toast.error('עדכון נכשל')
          return
        }
        if (createFile) await uploadPhoto(editingTask.id, createFile)
        toast.success('המשימה עודכנה')
      } else {
        const res = await fetchWithTimeout(
          '/api/maintenance-tasks',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: form.title.trim(),
              description: form.description.trim() || null,
              notes: form.notes.trim() || null,
              project_id: form.projectId || null,
              assigned_worker_id: form.workerId || null,
              priority: form.priority,
              due_at: form.dueAt ? new Date(form.dueAt).toISOString() : null,
              cadence: form.cadence,
              sync_to_calendar: true,
              source_ticket_id: form.sourceTicketId || null,
              ...extras,
            }),
          },
          MUTATION_FETCH_TIMEOUT_MS
        )
        const json = (await res.json().catch(() => ({}))) as { error?: string; task?: TaskRow }
        if (!res.ok) {
          toast.error(typeof json.error === 'string' ? json.error : 'יצירה נכשלה')
          return
        }
        if (createFile && json.task?.id) await uploadPhoto(json.task.id, createFile)
        toast.success('המשימה נוצרה')
      }
      closeDrawer()
      await load()
    } catch {
      toast.error('שגיאת חיבור')
    } finally {
      setSaving(false)
    }
  }

  async function patchTask(taskId: string, body: Record<string, unknown>, okMsg?: string) {
    setBusyId(taskId)
    try {
      const res = await fetchWithTimeout(
        '/api/maintenance-tasks',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task_id: taskId, ...body }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      if (!res.ok) {
        toast.error('עדכון נכשל')
        return
      }
      if (okMsg) toast.success(okMsg)
      await load()
    } catch {
      toast.error('שגיאת חיבור')
    } finally {
      setBusyId(null)
    }
  }

  async function toggleDone(t: TaskRow) {
    if (t.status === 'DONE') {
      await patchTask(t.id, { status: 'PENDING' })
      return
    }
    const cadence = (t.cadence || 'one_off') as MaintenanceCadence
    const wantsNext =
      cadence !== 'one_off' &&
      window.confirm('המשימה תושלם. ליצור את המופע הבא בסדרה?')
    setBusyId(t.id)
    try {
      const res = await fetchWithTimeout(
        '/api/maintenance-tasks',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_id: t.id,
            status: 'DONE',
            create_next_occurrence: wantsNext,
          }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const json = (await res.json().catch(() => ({}))) as {
        next_occurrence_id?: string | null
      }
      if (!res.ok) {
        toast.error('עדכון נכשל')
        return
      }
      if (wantsNext && json.next_occurrence_id) {
        toast.success('הושלמה — נוצר המופע הבא')
      } else {
        toast.success('הושלמה')
      }
      await load()
    } catch {
      toast.error('שגיאת חיבור')
    } finally {
      setBusyId(null)
    }
  }

  async function createNextOccurrence(taskId: string) {
    setBusyId(taskId)
    try {
      const res = await fetchWithTimeout(
        '/api/maintenance-tasks/create-next-occurrence',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task_id: taskId }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      if (!res.ok) {
        toast.error('יצירת המופע הבא נכשלה')
        return
      }
      toast.success('נוצר המופע הבא בסדרה')
      await load()
    } catch {
      toast.error('שגיאת חיבור')
    } finally {
      setBusyId(null)
    }
  }

  async function suggestWorker() {
    if (!form.projectId || !form.title.trim()) {
      toast.error('בחרו בניין ומלאו כותרת להמלצה')
      return
    }
    setSuggestBusy(true)
    try {
      const res = await fetchWithTimeout(
        '/api/maintenance-tasks/suggest-worker',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: form.projectId,
            title: form.title.trim(),
            description: form.description.trim() || null,
            assigned_worker_id: form.workerId || null,
          }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const json = (await res.json().catch(() => ({}))) as {
        suggestion?: {
          workerId?: string | null
          worker_id?: string | null
          reasonHe?: string
          reason?: string
        } | null
      }
      const workerId = json.suggestion?.workerId || json.suggestion?.worker_id
      if (!res.ok || !workerId) {
        toast.error('לא נמצאה המלצה')
        return
      }
      setForm((f) => ({ ...f, workerId }))
      toast.success(json.suggestion?.reasonHe || json.suggestion?.reason || 'הומלץ עובד')
    } catch {
      toast.error('שגיאת חיבור')
    } finally {
      setSuggestBusy(false)
    }
  }

  async function openTicketFromTask(taskId: string) {
    setBusyId(taskId)
    try {
      const res = await fetchWithTimeout(
        '/api/maintenance-tasks/create-ticket',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task_id: taskId }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const json = (await res.json().catch(() => ({}))) as {
        ticket_id?: string
        ticket_number?: number
        error?: string
      }
      if (!res.ok || !json.ticket_id) {
        toast.error(typeof json.error === 'string' ? json.error : 'פתיחת תקלה נכשלה')
        return
      }
      toast.success(
        json.ticket_number != null ? `נפתחה תקלה #${json.ticket_number}` : 'נפתחה תקלה'
      )
      window.location.href = `/tickets?ticket=${json.ticket_id}`
    } catch {
      toast.error('שגיאת חיבור')
    } finally {
      setBusyId(null)
    }
  }

  async function addAssetQuick() {
    if (!form.projectId) {
      toast.error('בחרו בניין לפני הוספת נכס')
      return
    }
    const name = window.prompt('שם הנכס / הציוד')
    if (!name?.trim()) return
    try {
      const res = await fetchWithTimeout(
        '/api/building-assets',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project_id: form.projectId, name: name.trim() }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const json = (await res.json().catch(() => ({}))) as {
        asset?: { id: string; name: string; project_id: string; public_slug?: string | null }
      }
      if (!res.ok || !json.asset) {
        toast.error('יצירת נכס נכשלה')
        return
      }
      setAssets((prev) => [...prev, json.asset!])
      setForm((f) => ({ ...f, assetId: json.asset!.id }))
      toast.success('נכס נוסף')
    } catch {
      toast.error('שגיאת חיבור')
    }
  }

  async function openAssetQr(assetId: string) {
    if (!assetId) {
      toast.error('בחרו נכס')
      return
    }
    try {
      const res = await fetchWithTimeout(
        '/api/building-assets/ensure-public-slug',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ asset_id: assetId }),
        },
        MUTATION_FETCH_TIMEOUT_MS
      )
      const json = (await res.json().catch(() => ({}))) as {
        error?: string
        public_slug?: string
        url?: string
      }
      if (!res.ok || !json.public_slug) {
        toast.error(json.error || 'יצירת QR נכשלה')
        return
      }
      setAssets((prev) =>
        prev.map((a) => (a.id === assetId ? { ...a, public_slug: json.public_slug } : a))
      )
      const url = json.url || buildingAssetPublicUrl(json.public_slug)
      window.open(url, '_blank', 'noopener,noreferrer')
      try {
        await navigator.clipboard.writeText(url)
        toast.success('קישור QR הועתק — אפשר להדביק במדבקה')
      } catch {
        toast.success('קישור QR נפתח')
      }
    } catch {
      toast.error('שגיאת חיבור')
    }
  }

  async function deleteTask(taskId: string) {
    if (!window.confirm('למחוק את המשימה?')) return
    setBusyId(taskId)
    try {
      const res = await fetchWithTimeout(
        `/api/maintenance-tasks?task_id=${encodeURIComponent(taskId)}`,
        { method: 'DELETE' },
        MUTATION_FETCH_TIMEOUT_MS
      )
      if (!res.ok) {
        toast.error('מחיקה נכשלה')
        return
      }
      toast.success('המשימה נמחקה')
      await load()
    } catch {
      toast.error('שגיאת חיבור')
    } finally {
      setBusyId(null)
    }
  }

  async function uploadPhoto(taskId: string, file: File) {
    try {
      const fd = new FormData()
      fd.append('task_id', taskId)
      fd.append('file', file)
      const res = await fetchWithTimeout(
        '/api/maintenance-tasks/attachments',
        { method: 'POST', body: fd },
        WORKER_PHOTO_TIMEOUT_MS
      )
      if (!res.ok) {
        toast.error('העלאת קובץ נכשלה')
        return
      }
      toast.success('הקובץ צורף')
      await loadAttachments(taskId)
    } catch {
      toast.error('שגיאת חיבור')
    }
  }

  const createBtn = (
    <Button variant="primary" onClick={openCreate}>
      משימה חדשה
    </Button>
  )

  return (
    <>
      {isMobile && (
        <MobileHeader
          title="משימות"
          subtitle="משימות אחזקה"
          onMenuClick={openMenu}
        />
      )}

      <div style={{ ...styles.content, ...(isMobile ? styles.contentMobile : {}) }}>
        {!isMobile && (
          <PageHeader
            title="משימות"
            subtitle="לוח בוקר — עבר / היום / השבוע לפי צבע מחזוריות"
            actions={createBtn}
          />
        )}

        {isMobile ? (
          <Button variant="primary" onClick={openCreate} style={styles.mobileCreateBtn}>
            + משימה חדשה
          </Button>
        ) : null}

        {!loading && projects.length > 0 ? (
          <TasksTemplatesBar projects={projects} onApplied={() => void load()} />
        ) : null}

        <div
          style={{
            ...styles.filtersRow,
            borderRadius: 12,
            border: `1px solid ${theme.colors.border}`,
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: isMobile ? 'stretch' : 'center',
          }}
        >
          <div style={styles.filtersStart}>
            <FilterTabs
              value={listFilter}
              onChange={(v) => setListFilter(v as ListFilter)}
              options={[
                { label: 'בוקר', value: 'morning' },
                { label: 'פתוחות', value: 'open' },
                { label: 'היום', value: 'today' },
                { label: 'שבוע', value: 'week' },
                { label: 'הכל', value: 'all' },
              ]}
            />
          </div>
          {listFilter !== 'week' ? (
            <>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  fontSize: 12,
                  color: theme.colors.textSecondary,
                  alignItems: 'center',
                }}
                aria-label="אגדת צבעי מחזוריות"
              >
                {MAINTENANCE_CADENCES.filter((c) => c !== 'one_off').map((c) => (
                  <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: cadenceColor(c),
                        display: 'inline-block',
                      }}
                    />
                    {MAINTENANCE_CADENCE_LABELS[c]}
                  </span>
                ))}
              </div>
              <label
                style={{
                  ...styles.check,
                  ...(isMobile ? styles.checkMobile : null),
                }}
              >
                <input
                  type="checkbox"
                  checked={groupByWorker}
                  onChange={(e) => setGroupByWorker(e.target.checked)}
                  style={isMobile ? { width: 18, height: 18 } : undefined}
                />
                <span>לפי עובד</span>
              </label>
            </>
          ) : null}
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : listFilter === 'week' ? (
          <Card title="שבוע משולב" subtitle="משימות לפי due + אירועי לוח שנה — גררו משימה ליום אחר">
            <TasksWeekBoard onChanged={() => void load()} />
          </Card>
        ) : (
          <Card noPadding>
            {visible.length === 0 ? (
              <EmptyState
                title="אין משימות להצגה"
                description="צרו משימת אחזקה, או שנו את הסינון."
                action={createBtn}
              />
            ) : (
              <div style={styles.list}>
                {grouped.map((group) => (
                  <div key={group.key}>
                    {group.label ? (
                      <div style={styles.groupTitle}>
                        {group.label}
                        <span style={styles.groupCount}> · {group.items.length}</span>
                      </div>
                    ) : null}
                    {group.items.map((t) => {
                      const done = t.status === 'DONE'
                      const busy = busyId === t.id
                      return (
                        <div key={t.id} style={styles.todoRow}>
                          <div style={styles.todoMain}>
                            <button
                              type="button"
                              aria-label={done ? 'פתח מחדש' : 'סמן כהושלם'}
                              disabled={busy}
                              onClick={() => void toggleDone(t)}
                              style={{
                                ...styles.checkBtn,
                                ...(isMobile ? styles.checkBtnMobile : null),
                                ...(done ? styles.checkBtnDone : null),
                              }}
                            >
                              {done ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                  <path d="M20 6 9 17l-5-5" />
                                </svg>
                              ) : null}
                            </button>
                            <button
                              type="button"
                              style={styles.todoBody}
                              onClick={() => openEdit(t)}
                            >
                              <div
                                style={{
                                  ...styles.todoTitle,
                                  ...(done ? styles.todoTitleDone : null),
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 8,
                                }}
                              >
                                <span
                                  title={cadenceLabel(t.cadence)}
                                  style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: 999,
                                    background: cadenceColor(t.cadence),
                                    flexShrink: 0,
                                  }}
                                />
                                {t.title}
                              </div>
                              <div style={styles.todoMeta}>
                                {cadenceLabel(t.cadence)} · {projectName(t)} · {relName(t)}
                                {t.due_at
                                  ? ` · ${new Date(t.due_at).toLocaleString('he-IL', {
                                      day: 'numeric',
                                      month: 'short',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}`
                                  : ''}
                                {listFilter === 'morning' && t.due_at
                                  ? ` · ${
                                      morningBucket(t.due_at) === 'overdue'
                                        ? 'באיחור'
                                        : morningBucket(t.due_at) === 'today'
                                          ? 'היום'
                                          : 'השבוע'
                                    }`
                                  : ''}
                                {t.priority === 'HIGH' || t.priority === 'URGENT'
                                  ? ` · ${PRIORITY_LABEL[t.priority]}`
                                  : ''}
                                {t.calendar_event_id ? (
                                  <>
                                    {' · '}
                                    <a
                                      href="/calendar"
                                      onClick={(e) => e.stopPropagation()}
                                      style={{ color: theme.colors.primary, fontWeight: 600 }}
                                    >
                                      פתח בלוח שנה
                                    </a>
                                  </>
                                ) : null}
                              </div>
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
                {hasMoreTasks && listFilter !== 'today' ? (
                  <div style={styles.loadMore}>
                    <Button
                      type="button"
                      variant="secondary"
                      loading={loadingMore}
                      onClick={() => void loadMoreTasks()}
                    >
                      טען עוד משימות
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
          </Card>
        )}
      </div>

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editingTask ? editingTask.title || 'כרטסת משימה' : 'משימה חדשה'}
        subtitle={
          editingTask
            ? `${cadenceLabel(editingTask.cadence)} · ${PRIORITY_LABEL[editingTask.priority] || editingTask.priority} · סידור מתקדם`
            : 'הוספה לרשימת המשימות'
        }
        isMobile={isMobile}
        footer={
          <div style={styles.drawerFooter}>
            {editingTask ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busyId === editingTask.id}
                  onClick={() => void toggleDone(editingTask)}
                >
                  {editingTask.status === 'DONE' ? 'פתח מחדש' : 'סמן הושלם'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busyId === editingTask.id}
                  onClick={() => void openTicketFromTask(editingTask.id)}
                >
                  פתח תקלה
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={busyId === editingTask.id}
                  onClick={() => void deleteTask(editingTask.id)}
                >
                  מחק
                </Button>
              </>
            ) : (
              <Button type="button" variant="secondary" onClick={closeDrawer} disabled={saving}>
                ביטול
              </Button>
            )}
            <Button type="button" onClick={() => void saveTask()} disabled={saving}>
              {saving ? 'שומר…' : editingTask ? 'שמור' : 'צור משימה'}
            </Button>
          </div>
        }
      >
        <div style={styles.formGrid}>
          {form.sourceTicketId ? (
            <div style={styles.ticketLinkBanner}>
              <span style={styles.ticketChip}>
                {form.sourceTicketNumber
                  ? `מקושר לתקלה #${form.sourceTicketNumber}`
                  : 'מקושר לתקלה'}
              </span>
              <a href={`/tickets?ticket=${form.sourceTicketId}`} style={styles.ticketBackLink}>
                חזרה לתקלה
              </a>
            </div>
          ) : null}
          <Field label="כותרת" full>
            <input
              style={styles.input}
              placeholder="למשל: בדיקת משאבה"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              autoFocus={!isMobile}
            />
          </Field>
          <Field label="תיאור" full>
            <textarea
              style={styles.textarea}
              placeholder="פירוט קצר (אופציונלי)"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2}
            />
          </Field>
          <Field label="הערות פנימיות" full>
            <textarea
              style={styles.textarea}
              placeholder="הערות למנהל / לעובד"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
            />
          </Field>
          <Field label="בניין">
            <select
              style={styles.input}
              value={form.projectId}
              onChange={(e) => {
                const projectId = e.target.value
                setForm((f) => ({ ...f, projectId, assetId: '' }))
                if (projectId) void loadAssets(projectId)
              }}
            >
              <option value="">ללא בניין</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="עובד אחראי">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select
                style={{ ...styles.input, flex: 1, minWidth: 140 }}
                value={form.workerId}
                onChange={(e) => setForm((f) => ({ ...f, workerId: e.target.value }))}
              >
                <option value="">ללא עובד</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.full_name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={suggestBusy}
                onClick={() => void suggestWorker()}
              >
                המלץ עובד
              </Button>
            </div>
          </Field>
          <Field label="עדיפות">
            <select
              style={styles.input}
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
            >
              <option value="LOW">נמוכה</option>
              <option value="MEDIUM">בינונית</option>
              <option value="HIGH">גבוהה</option>
              <option value="URGENT">דחופה</option>
            </select>
          </Field>
          <Field label="מחזוריות (צבע בלוח)">
            <select
              style={styles.input}
              value={form.cadence}
              onChange={(e) =>
                setForm((f) => ({ ...f, cadence: e.target.value as MaintenanceCadence }))
              }
            >
              {MAINTENANCE_CADENCES.map((c) => (
                <option key={c} value={c}>
                  {MAINTENANCE_CADENCE_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="תאריך ושעה לביצוע"
            hint="אופציונלי — בלי תאריך המשימה נשארת פתוחה"
          >
            <input
              type="datetime-local"
              style={styles.input}
              value={form.dueAt}
              onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))}
            />
          </Field>
          <Field label="דקות משוערות">
            <input
              type="number"
              min={1}
              style={styles.input}
              value={form.estimatedMinutes}
              onChange={(e) => setForm((f) => ({ ...f, estimatedMinutes: e.target.value }))}
              placeholder="למשל 45"
            />
          </Field>
          <Field label="עלות בפועל (₪)">
            <input
              type="number"
              min={0}
              step="0.01"
              style={styles.input}
              value={form.actualCostIls}
              onChange={(e) => setForm((f) => ({ ...f, actualCostIls: e.target.value }))}
            />
          </Field>
          <Field label="נכס / ציוד" full>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select
                style={{ ...styles.input, flex: 1 }}
                value={form.assetId}
                onChange={(e) => setForm((f) => ({ ...f, assetId: e.target.value }))}
                onFocus={() => {
                  if (form.projectId) void loadAssets(form.projectId)
                }}
              >
                <option value="">ללא נכס</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <Button type="button" variant="secondary" size="sm" onClick={() => void addAssetQuick()}>
                + נכס
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!form.assetId}
                onClick={() => void openAssetQr(form.assetId)}
              >
                QR ציוד
              </Button>
            </div>
          </Field>
          <Field label="צ׳ק־ליסט" full>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {form.checklist.map((item) => (
                <label key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(item.done_at)}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        checklist: f.checklist.map((c) =>
                          c.id === item.id
                            ? { ...c, done_at: e.target.checked ? new Date().toISOString() : null }
                            : c
                        ),
                      }))
                    }
                  />
                  <span style={{ flex: 1 }}>{item.text}</span>
                  <button
                    type="button"
                    style={styles.clearAttach}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        checklist: f.checklist.filter((c) => c.id !== item.id),
                      }))
                    }
                  >
                    הסר
                  </button>
                </label>
              ))}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  style={styles.input}
                  placeholder="פריט חדש"
                  value={form.checklistDraft}
                  onChange={(e) => setForm((f) => ({ ...f, checklistDraft: e.target.value }))}
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const text = form.checklistDraft.trim()
                    if (!text) return
                    setForm((f) => ({
                      ...f,
                      checklistDraft: '',
                      checklist: [
                        ...f.checklist,
                        {
                          id: `c_${Date.now()}_${f.checklist.length}`,
                          text,
                          done_at: null,
                        },
                      ],
                    }))
                  }}
                >
                  הוסף
                </Button>
              </div>
            </div>
          </Field>
          <Field label="קובץ / תמונה" full hint={createFile ? createFile.name : 'אופציונלי'}>
            <div style={styles.attachRow}>
              {editingTask ? (
                <>
                  <Button type="button" variant="secondary" onClick={() => editFileRef.current?.click()}>
                    צרף קובץ
                  </Button>
                  <input
                    ref={editFileRef}
                    type="file"
                    accept="image/*,application/pdf,video/mp4,video/webm"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f && editingTask) void uploadPhoto(editingTask.id, f)
                      e.target.value = ''
                    }}
                  />
                </>
              ) : (
                <>
                  <Button type="button" variant="secondary" onClick={() => createFileRef.current?.click()}>
                    {createFile ? 'החלף קובץ' : 'צרף קובץ'}
                  </Button>
                  {createFile ? (
                    <button
                      type="button"
                      style={styles.clearAttach}
                      onClick={() => {
                        setCreateFile(null)
                        if (createFileRef.current) createFileRef.current.value = ''
                      }}
                    >
                      הסר
                    </button>
                  ) : null}
                  <input
                    ref={createFileRef}
                    type="file"
                    accept="image/*,application/pdf,video/mp4,video/webm"
                    style={{ display: 'none' }}
                    onChange={(e) => setCreateFile(e.target.files?.[0] || null)}
                  />
                </>
              )}
            </div>
            {editingTask && (attachmentsByTask[editingTask.id] || []).length > 0 ? (
              <div style={{ ...styles.attRow, marginTop: 10 }}>
                {(attachmentsByTask[editingTask.id] || []).map((a) =>
                  a.public_url && (a.mime_type || '').startsWith('image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={a.id} src={a.public_url} alt={a.file_name} style={styles.thumb} />
                  ) : (
                    <a
                      key={a.id}
                      href={a.public_url || '#'}
                      target="_blank"
                      rel="noreferrer"
                      style={{ fontSize: 13 }}
                    >
                      {a.file_name}
                    </a>
                  )
                )}
              </div>
            ) : null}
          </Field>
        </div>
      </Drawer>
    </>
  )
}

const styles: Record<string, CSSProperties> = {
  content: {
    padding: '32px 40px 48px',
    maxWidth: 1400,
    margin: '0 auto',
    width: '100%',
    boxSizing: 'border-box',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  contentMobile: {
    padding: '16px 16px 24px',
    maxWidth: '100%',
    boxSizing: 'border-box',
    gap: 14,
  },
  mobileCreateBtn: {
    width: '100%',
    marginBottom: 4,
  },
  filtersRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    flexWrap: 'wrap',
    padding: '16px 20px',
    borderBottom: `1px solid ${theme.colors.border}`,
    background: theme.colors.mutedSurface,
  },
  filtersStart: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    minWidth: 0,
    maxWidth: '100%',
    flex: 1,
    overflowX: 'auto',
  },
  check: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: theme.colors.textSecondary,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  checkMobile: {
    minHeight: 44,
    paddingInlineEnd: 4,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0,
  },
  groupTitle: {
    padding: '12px 16px',
    fontSize: 13,
    fontWeight: 700,
    color: theme.colors.textSecondary,
    background: theme.colors.mutedSurface,
    borderBottom: `1px solid ${theme.colors.border}`,
  },
  groupCount: { fontWeight: 500 },
  todoRow: {
    borderBottom: `1px solid ${theme.colors.border}`,
    padding: '12px 16px',
    minWidth: 0,
  },
  todoMain: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    minWidth: 0,
  },
  checkBtn: {
    width: 28,
    height: 28,
    borderRadius: 999,
    border: `2px solid ${theme.colors.border}`,
    background: 'transparent',
    flexShrink: 0,
    marginTop: 2,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    color: theme.colors.textInverse,
  },
  checkBtnMobile: {
    width: 44,
    height: 44,
    marginTop: 0,
  },
  checkBtnDone: {
    background: theme.colors.success,
    borderColor: theme.colors.success,
  },
  cardActionsMobile: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 8,
  },
  actionBtnMobile: {
    minHeight: 44,
    width: '100%',
  },
  todoBody: {
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    font: 'inherit',
    color: 'inherit',
  },
  todoTitle: {
    fontWeight: 700,
    fontSize: 15,
    lineHeight: 1.35,
    wordBreak: 'break-word',
    color: theme.colors.textPrimary,
  },
  todoTitleDone: {
    textDecoration: 'line-through',
    color: theme.colors.textSecondary,
    fontWeight: 600,
  },
  todoMeta: {
    marginTop: 4,
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 1.4,
    wordBreak: 'break-word',
  },
  expand: {
    marginTop: 12,
    marginInlineStart: 40,
    paddingTop: 10,
    borderTop: `1px dashed ${theme.colors.border}`,
    minWidth: 0,
  },
  desc: {
    fontSize: 14,
    margin: '0 0 8px',
    lineHeight: 1.45,
    wordBreak: 'break-word',
  },
  notesLine: {
    fontSize: 13,
    margin: '0 0 8px',
    color: theme.colors.textSecondary,
    wordBreak: 'break-word',
  },
  cardActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
  },
  loadMore: {
    padding: 16,
    display: 'flex',
    justifyContent: 'center',
  },
  attRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  thumb: {
    width: 56,
    height: 56,
    objectFit: 'cover',
    borderRadius: 10,
  },
  formGrid: {
    display: 'grid',
    gap: 12,
    gridTemplateColumns: '1fr',
    minWidth: 0,
  },
  ticketLinkBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
    padding: '10px 12px',
    borderRadius: 12,
    background: theme.colors.primaryMuted,
    border: `1px solid ${theme.colors.primary}`,
  },
  ticketChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 999,
    background: theme.colors.primaryMuted,
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: 800,
    textDecoration: 'none',
    marginBottom: 8,
  },
  ticketBackLink: {
    fontSize: 13,
    fontWeight: 700,
    color: theme.colors.primary,
    textDecoration: 'underline',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    minWidth: 0,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: 700,
    color: theme.colors.textSecondary,
  },
  fieldHint: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    lineHeight: 1.35,
  },
  input: {
    width: '100%',
    maxWidth: '100%',
    padding: '11px 12px',
    borderRadius: 12,
    border: `1px solid ${theme.colors.border}`,
    fontSize: 16,
    background: theme.colors.surface,
    color: theme.colors.textPrimary,
    boxSizing: 'border-box',
    minWidth: 0,
  },
  textarea: {
    width: '100%',
    maxWidth: '100%',
    padding: '11px 12px',
    borderRadius: 12,
    border: `1px solid ${theme.colors.border}`,
    fontSize: 16,
    background: theme.colors.surface,
    color: theme.colors.textPrimary,
    boxSizing: 'border-box',
    minWidth: 0,
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  attachRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  clearAttach: {
    border: 'none',
    background: 'transparent',
    color: theme.colors.error,
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
    padding: 0,
  },
  drawerFooter: {
    display: 'flex',
    gap: 10,
    justifyContent: 'stretch',
    flexWrap: 'wrap',
  },
}
