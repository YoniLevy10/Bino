import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeId } from '@/lib/api-validation'
import { resolveWorkerFromToken } from '@/lib/worker-token-auth'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'
import {
  workerMaintenanceTaskCreateBodySchema,
  workerMaintenanceTaskUpdateBodySchema,
} from '@/lib/api-body-schemas'
import { assertProjectOwnedByClient } from '@/lib/tenant-owned-refs'
import {
  TICKET_ATTACHMENT_WORKER_MIME_TYPES,
  TICKET_ATTACHMENT_MAX_WORKER_BYTES,
} from '@/lib/ticket-attachment-upload'
import { createServerSignedAttachmentUrl } from '@/lib/ticket-attachment-url'

function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
}

const TASK_SELECT =
  'id, title, description, priority, status, due_at, notes, project_id, source_ticket_id, projects(name, address), tickets:source_ticket_id(id, ticket_number)'

export async function GET(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const ip = clientIp(req)
    const rl = await checkIpPostRouteLimit(admin, ip, 'worker-maintenance-tasks-get')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי נסיונות' }, { status: 429 })
    }

    const token = sanitizeId(req.nextUrl.searchParams.get('token'))
    const todayOnly = req.nextUrl.searchParams.get('today') !== '0'
    if (!token) return NextResponse.json({ error: 'אין גישה' }, { status: 401 })

    const worker = await resolveWorkerFromToken(token)
    if (!worker) return NextResponse.json({ error: 'אין גישה' }, { status: 401 })

    const { data, error } = await admin
      .from('maintenance_tasks')
      .select(TASK_SELECT)
      .eq('client_id', worker.client_id)
      .eq('assigned_worker_id', worker.id)
      .is('deleted_at', null)
      .neq('status', 'DONE')
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(100)

    if (error) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

    const { isMaintenanceTaskForToday } = await import('@/lib/maintenance-task-day')
    const tasks = (data || []).filter((row) =>
      todayOnly
        ? isMaintenanceTaskForToday({
            dueAt: (row as { due_at?: string | null }).due_at,
            status: (row as { status: string }).status,
          })
        : true
    )
    return NextResponse.json({ tasks })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const ip = clientIp(req)
    const rl = await checkIpPostRouteLimit(admin, ip, 'worker-maintenance-tasks-patch')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי נסיונות' }, { status: 429 })
    }

    const raw = await req.json().catch(() => null)
    const parsed = workerMaintenanceTaskUpdateBodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const worker = await resolveWorkerFromToken(parsed.data.token)
    if (!worker) return NextResponse.json({ error: 'אין גישה' }, { status: 401 })

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (parsed.data.status) {
      patch.status = parsed.data.status
      patch.completed_at = parsed.data.status === 'DONE' ? new Date().toISOString() : null
    }
    if (parsed.data.notes !== undefined) {
      patch.notes = parsed.data.notes?.trim() || null
    }

    const { data, error } = await admin
      .from('maintenance_tasks')
      .update(patch)
      .eq('id', parsed.data.task_id)
      .eq('client_id', worker.client_id)
      .eq('assigned_worker_id', worker.id)
      .is('deleted_at', null)
      .select(TASK_SELECT)
      .maybeSingle()

    if (error) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'משימה לא נמצאה' }, { status: 404 })
    return NextResponse.json({ task: data })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}

/** Create a task (JSON) or upload a photo (multipart). The task is the same row the manager dashboard lists. */
export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return createWorkerTask(req)
  }
  return uploadWorkerTaskPhoto(req)
}

async function createWorkerTask(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const ip = clientIp(req)
    const rl = await checkIpPostRouteLimit(admin, ip, 'worker-maintenance-tasks-create')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי נסיונות' }, { status: 429 })
    }

    const raw = await req.json().catch(() => null)
    const parsed = workerMaintenanceTaskCreateBodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
    }

    const worker = await resolveWorkerFromToken(parsed.data.token)
    if (!worker) return NextResponse.json({ error: 'אין גישה' }, { status: 401 })

    const projectOk = await assertProjectOwnedByClient(admin, worker.client_id, parsed.data.project_id)
    if (!projectOk.ok) {
      return NextResponse.json({ error: projectOk.error }, { status: 400 })
    }

    let sourceTicketId: string | null = parsed.data.source_ticket_id || null
    if (sourceTicketId) {
      const { data: ticket } = await admin
        .from('tickets')
        .select('id')
        .eq('id', sourceTicketId)
        .eq('client_id', worker.client_id)
        .eq('assigned_worker_id', worker.id)
        .is('deleted_at', null)
        .maybeSingle()
      if (!ticket) sourceTicketId = null
    }

    const { data, error } = await admin
      .from('maintenance_tasks')
      .insert({
        client_id: worker.client_id,
        project_id: parsed.data.project_id,
        assigned_worker_id: worker.id,
        source_ticket_id: sourceTicketId,
        title: parsed.data.title.trim(),
        description: parsed.data.description?.trim() || null,
        priority: parsed.data.priority || 'MEDIUM',
        status: 'PENDING',
        created_by: `worker:${worker.id}`,
      })
      .select(TASK_SELECT)
      .single()

    if (error) return NextResponse.json({ error: 'שמירת המשימה נכשלה' }, { status: 500 })
    return NextResponse.json({ task: data })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}

async function uploadWorkerTaskPhoto(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const ip = clientIp(req)
    const rl = await checkIpPostRouteLimit(admin, ip, 'worker-maintenance-tasks-upload')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי נסיונות' }, { status: 429 })
    }

    const form = await req.formData()
    const token = sanitizeId(form.get('token')?.toString() ?? null)
    const taskId = sanitizeId(form.get('task_id')?.toString() ?? null)
    const fileValue = form.get('file')
    const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null

    if (!token || !taskId || !file) {
      return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
    }

    const worker = await resolveWorkerFromToken(token)
    if (!worker) return NextResponse.json({ error: 'אין גישה' }, { status: 401 })

    if (!(TICKET_ATTACHMENT_WORKER_MIME_TYPES as readonly string[]).includes(file.type)) {
      return NextResponse.json({ error: 'סוג קובץ לא נתמך' }, { status: 400 })
    }
    if (file.size > TICKET_ATTACHMENT_MAX_WORKER_BYTES) {
      return NextResponse.json({ error: 'קובץ גדול מדי' }, { status: 400 })
    }

    const { data: task } = await admin
      .from('maintenance_tasks')
      .select('id')
      .eq('id', taskId)
      .eq('client_id', worker.client_id)
      .eq('assigned_worker_id', worker.id)
      .is('deleted_at', null)
      .maybeSingle()

    if (!task) return NextResponse.json({ error: 'משימה לא נמצאה' }, { status: 404 })

    const ext = file.name.split('.').pop() || 'jpg'
    const path = `maintenance-tasks/${taskId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const bytes = Buffer.from(await file.arrayBuffer())
    const { error: upErr } = await admin.storage
      .from('ticket-attachments')
      .upload(path, bytes, { contentType: file.type, upsert: false })
    if (upErr) return NextResponse.json({ error: 'העלאה נכשלה' }, { status: 500 })

    const { data: row, error: insErr } = await admin
      .from('maintenance_task_attachments')
      .insert({
        task_id: taskId,
        client_id: worker.client_id,
        file_name: file.name,
        file_url: path,
        mime_type: file.type,
        uploaded_by_worker_id: worker.id,
      })
      .select('id, file_name, file_url, mime_type')
      .single()

    if (insErr || !row) {
      await admin.storage.from('ticket-attachments').remove([path])
      return NextResponse.json({ error: 'שמירה נכשלה' }, { status: 500 })
    }

    const signed = await createServerSignedAttachmentUrl(admin, path)
    return NextResponse.json({ attachment: { ...row, public_url: signed } })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
