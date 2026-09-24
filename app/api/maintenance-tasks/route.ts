import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import {
  createMaintenanceTaskBodySchema,
  updateMaintenanceTaskBodySchema,
} from '@/lib/api-body-schemas'
import { withSignedAttachmentUrls } from '@/lib/ticket-attachment-url'

const TASK_SELECT =
  'id, client_id, project_id, assigned_worker_id, title, description, priority, status, due_at, notes, created_at, updated_at, completed_at, projects(name, address), workers:assigned_worker_id(full_name)'

export async function GET() {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const clientId = auth.ctx.clientId

  const [tasksRes, workersRes, projectsRes] = await Promise.all([
    admin
      .from('maintenance_tasks')
      .select(TASK_SELECT)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(300),
    admin
      .from('workers')
      .select('id, full_name')
      .eq('client_id', clientId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('full_name'),
    // projects has no deleted_at column — do not filter it
    admin.from('projects').select('id, name').eq('client_id', clientId).order('name'),
  ])

  if (tasksRes.error) {
    return NextResponse.json({ error: tasksRes.error.message }, { status: 500 })
  }

  const tasks = tasksRes.data || []
  const previewTaskIds = tasks.slice(0, 40).map((t) => t.id as string)

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
    open_count: tasks.filter((t) => t.status !== 'DONE').length,
    attachments_by_task: attachmentsByTask,
  })
}

export async function POST(req: Request) {
  const auth = await requireSessionClientId()
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
  const { data, error } = await admin
    .from('maintenance_tasks')
    .insert({
      client_id: auth.ctx.clientId,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      project_id: body.project_id || null,
      assigned_worker_id: body.assigned_worker_id || null,
      priority: body.priority || 'MEDIUM',
      due_at: body.due_at || null,
      notes: body.notes?.trim() || null,
      created_by: auth.ctx.userId,
      status: 'PENDING',
    })
    .select(TASK_SELECT)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ task: data })
}

export async function PATCH(req: Request) {
  const auth = await requireSessionClientId()
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
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (rest.title !== undefined) patch.title = rest.title.trim()
  if (rest.description !== undefined) patch.description = rest.description?.trim() || null
  if (rest.project_id !== undefined) patch.project_id = rest.project_id
  if (rest.assigned_worker_id !== undefined) patch.assigned_worker_id = rest.assigned_worker_id
  if (rest.priority !== undefined) patch.priority = rest.priority
  if (rest.status !== undefined) {
    patch.status = rest.status
    patch.completed_at = rest.status === 'DONE' ? new Date().toISOString() : null
  }
  if (rest.due_at !== undefined) patch.due_at = rest.due_at
  if (rest.notes !== undefined) patch.notes = rest.notes?.trim() || null

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

  return NextResponse.json({ task: data })
}

export async function DELETE(req: Request) {
  const auth = await requireSessionClientId()
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
