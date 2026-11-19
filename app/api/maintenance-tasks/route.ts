import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId, requireSessionWriteAccess } from '@/lib/auth-api/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/shared/rate-limit'
import {
  createMaintenanceTaskBodySchema,
  updateMaintenanceTaskBodySchema,
} from '@/lib/api-body-schemas'
import { withSignedAttachmentUrls } from '@/lib/tickets/ticket-attachment-url'
import {
  assertProjectOwnedByClient,
  assertTicketOwnedByClient,
  assertWorkerOwnedByClient,
} from '@/lib/tenant/tenant-owned-refs'
import { notifyWorkerMaintenanceTaskAssigned } from '@/lib/notify/notify-worker-maintenance-task'
import { runAfterResponse } from '@/lib/run-after-response'
import { normalizeMaintenanceCadence } from '@/lib/maintenance/maintenance-cadence'
import { syncMaintenanceTaskToCalendar } from '@/lib/maintenance/maintenance-task-calendar-sync'
import { normalizeChecklistItems } from '@/lib/maintenance/maintenance-checklist'
import { costIlsFromMinutes } from '@/lib/maintenance/maintenance-task-cost'
import { createNextMaintenanceOccurrence } from '@/lib/maintenance/maintenance-create-next-occurrence'

const TASK_SELECT =
  'id, client_id, project_id, assigned_worker_id, source_ticket_id, title, description, priority, status, due_at, notes, cadence, color_key, calendar_event_id, series_id, checklist_items, completed_by_user_id, completed_by_worker_id, asset_id, estimated_minutes, actual_cost_ils, created_at, updated_at, completed_at, projects(name, address), workers:assigned_worker_id(full_name, hourly_rate), tickets:source_ticket_id(id, ticket_number)'

/** Fallback when migrations 151+ not applied yet (42703 series_id / checklist). */
const TASK_SELECT_LEGACY =
  'id, client_id, project_id, assigned_worker_id, source_ticket_id, title, description, priority, status, due_at, notes, cadence, color_key, calendar_event_id, created_at, updated_at, completed_at, projects(name, address), workers:assigned_worker_id(full_name, hourly_rate), tickets:source_ticket_id(id, ticket_number)'

function isMissingColumnError(message: string | undefined): boolean {
  if (!message) return false
  return (
    /series_id/i.test(message) ||
    /checklist_items/i.test(message) ||
    /does not exist/i.test(message) ||
    /42703/.test(message)
  )
}

export async function GET(req: Request) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const clientId = auth.ctx.clientId
  const url = new URL(req.url)
  const rawLimit = Number(url.searchParams.get('limit') || '100')
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 300) : 100
  const rawOffset = Number(url.searchParams.get('offset') || '0')
  const offset = Number.isFinite(rawOffset) ? Math.max(Math.floor(rawOffset), 0) : 0
  const filter = (url.searchParams.get('filter') || 'all').trim().toLowerCase()
  const dueFrom = url.searchParams.get('from')?.trim() || null
  const dueTo = url.searchParams.get('to')?.trim() || null

  function buildTasksQuery(cols: string) {
    let q = admin
      .from('maintenance_tasks')
      .select(cols)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (filter === 'open') q = q.neq('status', 'DONE')
    else if (filter === 'done') q = q.eq('status', 'DONE')
    if (dueFrom) q = q.gte('due_at', dueFrom)
    if (dueTo) q = q.lt('due_at', dueTo)
    return q
  }

  const [tasksResInitial, workersRes, projectsRes, openCountRes] = await Promise.all([
    buildTasksQuery(TASK_SELECT),
    admin
      .from('workers')
      .select('id, full_name')
      .eq('client_id', clientId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('full_name'),
    // projects has no deleted_at column — do not filter it
    admin.from('projects').select('id, name').eq('client_id', clientId).order('name'),
    admin
      .from('maintenance_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .neq('status', 'DONE'),
  ])

  let tasksRes = tasksResInitial
  if (tasksRes.error && isMissingColumnError(tasksRes.error.message)) {
    tasksRes = await buildTasksQuery(TASK_SELECT_LEGACY)
  }

  if (tasksRes.error) {
    return NextResponse.json({ error: tasksRes.error.message }, { status: 500 })
  }

  // Dynamic select string → Supabase types as GenericStringError; cast for response shaping.
  type TaskListRow = { id: string; status: string }
  const tasks = (tasksRes.data || []) as unknown as TaskListRow[]
  const hasMore = tasks.length >= limit
  const previewTaskIds = tasks.slice(0, 40).map((t) => t.id)

  let attachmentsByTask: Record<
    string,
    Array<{
      id: string
      file_name: string | null
      mime_type: string | null
      created_at: string
      public_url: string | null
    }>
  > = {}

  if (previewTaskIds.length > 0) {
    const { data: attRows } = await admin
      .from('maintenance_task_attachments')
      .select('id, task_id, file_name, file_url, mime_type, created_at')
      .eq('client_id', clientId)
      .in('task_id', previewTaskIds)
      .order('created_at', { ascending: false })

    const signed = await withSignedAttachmentUrls(admin, attRows || [])
    attachmentsByTask = {}
    for (const a of signed) {
      const taskId = (a as { task_id?: string }).task_id
      if (!taskId) continue
      if (!attachmentsByTask[taskId]) attachmentsByTask[taskId] = []
      attachmentsByTask[taskId].push({
        id: a.id as string,
        file_name: (a.file_name as string | null) ?? null,
        mime_type: (a.mime_type as string | null) ?? null,
        created_at: a.created_at as string,
        public_url: a.signed_url,
      })
    }
  }

  return NextResponse.json({
    tasks,
    workers: workersRes.data || [],
    projects: projectsRes.data || [],
    open_count: openCountRes.count ?? tasks.filter((t) => t.status !== 'DONE').length,
    has_more: hasMore,
    limit,
    offset,
    filter,
    attachments_by_task: attachmentsByTask,
  })
}

function queueAssignNotify(
  admin: ReturnType<typeof getSupabaseAdmin>,
  opts: {
    clientId: string
    workerId: string
    taskId: string
    title: string
    ticketNumber?: number | null
  }
) {
  runAfterResponse(
    'maintenance-task-assign-notify',
    async () => {
      const { data: clientRow } = await admin
        .from('clients')
        .select('sms_sender_name')
        .eq('id', opts.clientId)
        .maybeSingle()
      await notifyWorkerMaintenanceTaskAssigned(admin, {
        clientId: opts.clientId,
        workerId: opts.workerId,
        taskId: opts.taskId,
        title: opts.title,
        ticketNumber: opts.ticketNumber,
        smsSenderName: (clientRow as { sms_sender_name?: string | null } | null)?.sms_sender_name,
      })
    },
    { clientId: opts.clientId, alertOps: false }
  )
}

export async function POST(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'maintenance-tasks-create')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const raw = await req.json().catch(() => null)
  const parsed = createMaintenanceTaskBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const body = parsed.data
  const projectOk = await assertProjectOwnedByClient(admin, auth.ctx.clientId, body.project_id)
  if (!projectOk.ok) {
    return NextResponse.json({ error: projectOk.error }, { status: 400 })
  }
  const workerOk = await assertWorkerOwnedByClient(
    admin,
    auth.ctx.clientId,
    body.assigned_worker_id
  )
  if (!workerOk.ok) {
    return NextResponse.json({ error: workerOk.error }, { status: 400 })
  }
  const ticketOk = await assertTicketOwnedByClient(
    admin,
    auth.ctx.clientId,
    body.source_ticket_id
  )
  if (!ticketOk.ok) {
    return NextResponse.json({ error: ticketOk.error }, { status: 400 })
  }

  // Prefer explicit project_id; else inherit from linked ticket when present.
  const projectId = body.project_id || ticketOk.projectId || null

  const cadence = normalizeMaintenanceCadence(body.cadence)
  const checklist = body.checklist_items
    ? normalizeChecklistItems(body.checklist_items)
    : []

  const { data, error } = await admin
    .from('maintenance_tasks')
    .insert({
      client_id: auth.ctx.clientId,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      project_id: projectId,
      assigned_worker_id: body.assigned_worker_id || null,
      source_ticket_id: body.source_ticket_id || null,
      priority: body.priority || 'MEDIUM',
      due_at: body.due_at || null,
      notes: body.notes?.trim() || null,
      cadence,
      checklist_items: checklist,
      series_id: body.series_id || null,
      asset_id: body.asset_id || null,
      estimated_minutes: body.estimated_minutes ?? null,
      actual_cost_ils: body.actual_cost_ils ?? null,
      created_by: auth.ctx.userId,
      status: 'PENDING',
    })
    .select(TASK_SELECT)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // First occurrence of a series: default series_id to task id when cadence is recurring
  if (data?.id && !body.series_id && cadence !== 'one_off') {
    await admin
      .from('maintenance_tasks')
      .update({ series_id: data.id, updated_at: new Date().toISOString() })
      .eq('id', data.id)
      .eq('client_id', auth.ctx.clientId)
    ;(data as { series_id?: string }).series_id = data.id as string
  }

  if (body.assigned_worker_id && data?.id) {
    queueAssignNotify(admin, {
      clientId: auth.ctx.clientId,
      workerId: body.assigned_worker_id,
      taskId: data.id as string,
      title: body.title.trim(),
      ticketNumber: ticketOk.ticketNumber,
    })
  }

  let task = data
  const wantCal = body.sync_to_calendar !== false
  if (wantCal && data?.id && body.due_at) {
    const calId = await syncMaintenanceTaskToCalendar(admin, {
      clientId: auth.ctx.clientId,
      userId: auth.ctx.userId,
      taskId: data.id as string,
      title: body.title.trim(),
      dueAt: body.due_at,
      cadence,
      projectId,
      calendarEventId: null,
      status: 'PENDING',
    })
    if (calId) {
      const { data: refreshed } = await admin
        .from('maintenance_tasks')
        .select(TASK_SELECT)
        .eq('id', data.id)
        .maybeSingle()
      if (refreshed) task = refreshed
    }
  }

  return NextResponse.json({ task })
}

export async function PATCH(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'maintenance-tasks-update')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const raw = await req.json().catch(() => null)
  const parsed = updateMaintenanceTaskBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { task_id, ...rest } = parsed.data
  if (rest.project_id !== undefined) {
    const projectOk = await assertProjectOwnedByClient(admin, auth.ctx.clientId, rest.project_id)
    if (!projectOk.ok) {
      return NextResponse.json({ error: projectOk.error }, { status: 400 })
    }
  }
  if (rest.assigned_worker_id !== undefined) {
    const workerOk = await assertWorkerOwnedByClient(
      admin,
      auth.ctx.clientId,
      rest.assigned_worker_id
    )
    if (!workerOk.ok) {
      return NextResponse.json({ error: workerOk.error }, { status: 400 })
    }
  }
  let ticketNumber: number | null = null
  if (rest.source_ticket_id !== undefined) {
    const ticketOk = await assertTicketOwnedByClient(
      admin,
      auth.ctx.clientId,
      rest.source_ticket_id
    )
    if (!ticketOk.ok) {
      return NextResponse.json({ error: ticketOk.error }, { status: 400 })
    }
    ticketNumber = ticketOk.ticketNumber
  }

  const { data: before } = await admin
    .from('maintenance_tasks')
    .select(
      'id, assigned_worker_id, title, description, source_ticket_id, due_at, cadence, calendar_event_id, project_id, status, series_id, checklist_items, estimated_minutes, asset_id, notes, priority'
    )
    .eq('id', task_id)
    .eq('client_id', auth.ctx.clientId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!before) {
    return NextResponse.json({ error: 'משימה לא נמצאה' }, { status: 404 })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (rest.title !== undefined) patch.title = rest.title.trim()
  if (rest.description !== undefined) patch.description = rest.description?.trim() || null
  if (rest.project_id !== undefined) patch.project_id = rest.project_id
  if (rest.assigned_worker_id !== undefined) patch.assigned_worker_id = rest.assigned_worker_id
  if (rest.priority !== undefined) patch.priority = rest.priority
  if (rest.status !== undefined) {
    patch.status = rest.status
    if (rest.status === 'DONE') {
      patch.completed_at = new Date().toISOString()
      patch.completed_by_user_id = auth.ctx.userId
      patch.completed_by_worker_id = null
      // Auto cost from worker rate × estimated minutes when not set
      if (rest.actual_cost_ils === undefined) {
        const workerId =
          rest.assigned_worker_id !== undefined
            ? rest.assigned_worker_id
            : (before as { assigned_worker_id?: string | null }).assigned_worker_id
        const minutes =
          rest.estimated_minutes !== undefined
            ? rest.estimated_minutes
            : (before as { estimated_minutes?: number | null }).estimated_minutes
        if (workerId && minutes) {
          const { data: w } = await admin
            .from('workers')
            .select('hourly_rate')
            .eq('id', workerId)
            .eq('client_id', auth.ctx.clientId)
            .maybeSingle()
          const cost = costIlsFromMinutes(
            (w as { hourly_rate?: number | null } | null)?.hourly_rate,
            minutes
          )
          if (cost != null) patch.actual_cost_ils = cost
        }
      }
    } else {
      patch.completed_at = null
      patch.completed_by_user_id = null
      patch.completed_by_worker_id = null
    }
  }
  if (rest.due_at !== undefined) patch.due_at = rest.due_at
  if (rest.notes !== undefined) patch.notes = rest.notes?.trim() || null
  if (rest.source_ticket_id !== undefined) patch.source_ticket_id = rest.source_ticket_id
  if (rest.cadence !== undefined) patch.cadence = normalizeMaintenanceCadence(rest.cadence)
  if (rest.checklist_items !== undefined) {
    patch.checklist_items = normalizeChecklistItems(rest.checklist_items)
  }
  if (rest.series_id !== undefined) patch.series_id = rest.series_id
  if (rest.asset_id !== undefined) patch.asset_id = rest.asset_id
  if (rest.estimated_minutes !== undefined) patch.estimated_minutes = rest.estimated_minutes
  if (rest.actual_cost_ils !== undefined) patch.actual_cost_ils = rest.actual_cost_ils

  const { data, error } = await admin
    .from('maintenance_tasks')
    .update(patch)
    .eq('id', task_id)
    .eq('client_id', auth.ctx.clientId)
    .is('deleted_at', null)
    .select(TASK_SELECT)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'משימה לא נמצאה' }, { status: 404 })
  }

  const wantCal = rest.sync_to_calendar !== false
  if (wantCal) {
    const row = data as {
      id: string
      title: string
      due_at: string | null
      cadence: string | null
      calendar_event_id: string | null
      project_id: string | null
      status: string
    }
    await syncMaintenanceTaskToCalendar(admin, {
      clientId: auth.ctx.clientId,
      userId: auth.ctx.userId,
      taskId: row.id,
      title: row.title,
      dueAt: row.due_at,
      cadence: row.cadence,
      projectId: row.project_id,
      calendarEventId: row.calendar_event_id,
      status: row.status,
    })
  }

  const prevWorker = (before as { assigned_worker_id?: string | null }).assigned_worker_id || null
  const nextWorker =
    rest.assigned_worker_id !== undefined
      ? rest.assigned_worker_id || null
      : prevWorker
  const assignedChanged =
    rest.assigned_worker_id !== undefined && nextWorker && nextWorker !== prevWorker

  if (assignedChanged && nextWorker) {
    if (ticketNumber == null) {
      const srcId =
        rest.source_ticket_id !== undefined
          ? rest.source_ticket_id
          : ((before as { source_ticket_id?: string | null }).source_ticket_id ?? null)
      if (srcId) {
        const ticketOk = await assertTicketOwnedByClient(admin, auth.ctx.clientId, srcId)
        if (ticketOk.ok) ticketNumber = ticketOk.ticketNumber
      }
    }
    queueAssignNotify(admin, {
      clientId: auth.ctx.clientId,
      workerId: nextWorker,
      taskId: task_id,
      title:
        rest.title !== undefined
          ? rest.title.trim()
          : String((before as { title?: string }).title || ''),
      ticketNumber,
    })
  }

  let nextOccurrenceId: string | null = null
  // Explicit flag only — UI toast / button sets create_next_occurrence: true
  if (rest.create_next_occurrence === true && (rest.status === 'DONE' || data.status === 'DONE')) {
    const src = {
      ...(before as Sourceish),
      ...(data as object),
    } as Sourceish
    const spawned = await createNextMaintenanceOccurrence(admin, {
      clientId: auth.ctx.clientId,
      userId: auth.ctx.userId,
      source: {
        id: String(src.id),
        title: String(src.title || ''),
        description: src.description,
        project_id: src.project_id,
        assigned_worker_id: src.assigned_worker_id,
        priority: src.priority,
        notes: src.notes,
        cadence: src.cadence,
        due_at: src.due_at,
        series_id: src.series_id,
        checklist_items: src.checklist_items,
        asset_id: src.asset_id,
        estimated_minutes: src.estimated_minutes,
      },
    })
    if (spawned.ok) nextOccurrenceId = spawned.taskId
  }

  return NextResponse.json({ task: data, next_occurrence_id: nextOccurrenceId })
}

type Sourceish = {
  id: string
  title?: string
  description?: string | null
  project_id?: string | null
  assigned_worker_id?: string | null
  priority?: string | null
  notes?: string | null
  cadence?: string | null
  due_at?: string | null
  series_id?: string | null
  checklist_items?: unknown
  asset_id?: string | null
  estimated_minutes?: number | null
}

export async function DELETE(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const url = new URL(req.url)
  const taskId = url.searchParams.get('task_id')?.trim()
  if (!taskId) {
    return NextResponse.json({ error: 'חסר מזהה משימה' }, { status: 400 })
  }

  const { error } = await admin
    .from('maintenance_tasks')
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('client_id', auth.ctx.clientId)
    .is('deleted_at', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
