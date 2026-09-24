import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import {
  createMaintenanceTaskBodySchema,
  updateMaintenanceTaskBodySchema,
} from '@/lib/api-body-schemas'

const TASK_SELECT =
  'id, client_id, project_id, assigned_worker_id, title, description, priority, status, due_at, notes, created_at, updated_at, completed_at, projects(name, address), workers:assigned_worker_id(full_name)'

export async function GET() {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('maintenance_tasks')
    .select(TASK_SELECT)
    .eq('client_id', auth.ctx.clientId)
    .is('deleted_at', null)
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(300)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ tasks: data || [] })
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
