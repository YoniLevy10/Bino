import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeId } from '@/lib/api-validation'
import { resolveWorkerFromToken, verifyWorkerOwnsTicket } from '@/lib/worker-token-auth'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'
import {
  TICKET_ATTACHMENT_MAX_WORKER_BYTES,
  TICKET_ATTACHMENT_WORKER_MIME_TYPES,
} from '@/lib/ticket-attachment-upload'

function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
}

/**
 * Worker marks PROFESSIONAL_ESCORT with optional note + photo.
 * Does not close the ticket. Gated by workers.can_mark_professional_escort.
 */
export async function POST(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const ip = clientIp(req)
    const rl = await checkIpPostRouteLimit(admin, ip, 'worker-escort')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי נסיונות' }, { status: 429 })
    }

    const form = await req.formData()
    const token = sanitizeId(form.get('token')?.toString() ?? null)
    const ticketId = sanitizeId(form.get('ticket_id')?.toString() ?? null)
    const note = (form.get('note')?.toString() || '').trim().slice(0, 1000)
    const fileValue = form.get('file')
    const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null

    if (!token || !ticketId) {
      return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
    }

    const worker = await resolveWorkerFromToken(token)
    if (!worker) return NextResponse.json({ error: 'אין גישה' }, { status: 401 })

    const { data: workerRow } = await admin
      .from('workers')
      .select('can_mark_professional_escort, full_name')
      .eq('id', worker.id)
      .maybeSingle()

    if (!(workerRow as { can_mark_professional_escort?: boolean } | null)?.can_mark_professional_escort) {
      return NextResponse.json({ error: 'אין הרשאה לפעולה זו' }, { status: 403 })
    }

    const owns = await verifyWorkerOwnsTicket(admin, ticketId, worker.id, worker.client_id)
    if (!owns) return NextResponse.json({ error: 'תקלה לא נמצאה' }, { status: 404 })

    let attachmentPath: string | null = null
    if (file) {
      if (!(TICKET_ATTACHMENT_WORKER_MIME_TYPES as readonly string[]).includes(file.type)) {
        return NextResponse.json({ error: 'סוג קובץ לא נתמך' }, { status: 400 })
      }
      if (file.size > TICKET_ATTACHMENT_MAX_WORKER_BYTES) {
        return NextResponse.json({ error: 'קובץ גדול מדי' }, { status: 400 })
      }
      const ext = file.name.split('.').pop() || 'jpg'
      attachmentPath = `${ticketId}/${Date.now()}-escort-${Math.random().toString(36).slice(2)}.${ext}`
      const bytes = Buffer.from(await file.arrayBuffer())
      const { error: upErr } = await admin.storage
        .from('ticket-attachments')
        .upload(attachmentPath, bytes, { contentType: file.type, upsert: false })
      if (upErr) return NextResponse.json({ error: 'העלאת תמונה נכשלה' }, { status: 500 })

      await admin.from('ticket_attachments').insert({
        ticket_id: ticketId,
        file_name: file.name,
        file_url: attachmentPath,
        mime_type: file.type,
        attachment_type: 'worker_escort',
      })
    }

    const now = new Date().toISOString()
    const { error: statusErr } = await admin
      .from('tickets')
      .update({ status: 'PROFESSIONAL_ESCORT', updated_at: now })
      .eq('id', ticketId)
      .eq('client_id', worker.client_id)
      .neq('status', 'CLOSED')

    if (statusErr) {
      return NextResponse.json({ error: 'עדכון סטטוס נכשל' }, { status: 500 })
    }

    const workerName =
      (workerRow as { full_name?: string } | null)?.full_name || worker.full_name || 'עובד'

    await admin.from('ticket_logs').insert({
      ticket_id: ticketId,
      action_type: 'WORKER_PROFESSIONAL_ESCORT',
      notes: note || `ליווי בעל מקצוע — ${workerName}`,
      created_by: 'worker',
      meta: {
        worker_id: worker.id,
        worker_name: workerName,
        has_photo: Boolean(attachmentPath),
        attachment_path: attachmentPath,
      },
    })

    return NextResponse.json({ ok: true, status: 'PROFESSIONAL_ESCORT' })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
