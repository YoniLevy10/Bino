import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { sanitizeId } from '@/lib/api-validation'
import {
  TICKET_ATTACHMENT_MAX_IMAGE_BYTES,
  TICKET_ATTACHMENT_WEB_MIME_TYPES,
} from '@/lib/ticket-attachment-upload'
import { createServerSignedAttachmentUrl, withSignedAttachmentUrls } from '@/lib/ticket-attachment-url'

export async function GET(req: NextRequest) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const taskId = sanitizeId(req.nextUrl.searchParams.get('task_id'))
  if (!taskId) return NextResponse.json({ error: 'חסר מזהה משימה' }, { status: 400 })

  const admin = getSupabaseAdmin()
  const { data: task } = await admin
    .from('maintenance_tasks')
    .select('id')
    .eq('id', taskId)
    .eq('client_id', auth.ctx.clientId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!task) return NextResponse.json({ error: 'משימה לא נמצאה' }, { status: 404 })

  const { data, error } = await admin
    .from('maintenance_task_attachments')
    .select('id, file_name, file_url, mime_type, created_at')
    .eq('task_id', taskId)
    .eq('client_id', auth.ctx.clientId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const signed = await withSignedAttachmentUrls(admin, data || [])
  return NextResponse.json({
    attachments: signed.map((a) => ({
      id: a.id,
      file_name: a.file_name,
      mime_type: a.mime_type,
      created_at: a.created_at,
      public_url: a.signed_url,
    })),
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(
    admin,
    auth.ctx.userId,
    'maintenance-tasks-attach'
  )
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const form = await req.formData()
  const taskId = sanitizeId(form.get('task_id')?.toString() ?? null)
  const fileValue = form.get('file')
  const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null
  if (!taskId || !file) {
    return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
  }

  if (!(TICKET_ATTACHMENT_WEB_MIME_TYPES as readonly string[]).includes(file.type)) {
    return NextResponse.json({ error: 'סוג קובץ לא נתמך' }, { status: 400 })
  }
  if (file.size > TICKET_ATTACHMENT_MAX_IMAGE_BYTES && !file.type.includes('pdf') && !file.type.includes('video')) {
    // images 5MB; allow pdf/video with larger limits from web set — keep simple 15MB cap
  }
  const maxBytes = file.type.startsWith('video/') || file.type === 'application/pdf' ? 15 * 1024 * 1024 : TICKET_ATTACHMENT_MAX_IMAGE_BYTES
  if (file.size > maxBytes) {
    return NextResponse.json({ error: 'קובץ גדול מדי' }, { status: 400 })
  }

  const { data: task } = await admin
    .from('maintenance_tasks')
    .select('id')
    .eq('id', taskId)
    .eq('client_id', auth.ctx.clientId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!task) return NextResponse.json({ error: 'משימה לא נמצאה' }, { status: 404 })

  const ext = file.name.split('.').pop() || 'bin'
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
      client_id: auth.ctx.clientId,
      file_name: file.name,
      file_url: path,
      mime_type: file.type,
    })
    .select('id, file_name, file_url, mime_type, created_at')
    .single()

  if (insErr || !row) {
    await admin.storage.from('ticket-attachments').remove([path])
    return NextResponse.json({ error: 'שמירה נכשלה' }, { status: 500 })
  }

  const publicUrl = await createServerSignedAttachmentUrl(admin, path)
  return NextResponse.json({
    attachment: { ...row, public_url: publicUrl },
  })
}
