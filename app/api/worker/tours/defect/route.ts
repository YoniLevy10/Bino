import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeId } from '@/lib/api-validation'
import { resolveWorkerFromToken } from '@/lib/worker-token-auth'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'
import {
  TICKET_ATTACHMENT_MAX_WORKER_BYTES,
  TICKET_ATTACHMENT_WORKER_MIME_TYPES,
} from '@/lib/ticket-attachment-upload'
import { z } from 'zod'

function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
}

const defectBodySchema = z.object({
  token: z.string().uuid(),
  tour_id: z.string().uuid(),
  description: z.string().min(3).max(2000),
})

/**
 * Report a defect found during a site tour → opens a new ticket linked to the tour.
 */
export async function POST(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const ip = clientIp(req)
    const rl = await checkIpPostRouteLimit(admin, ip, 'worker-tour-defect')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי נסיונות' }, { status: 429 })
    }

    const contentType = (req.headers.get('content-type') || '').toLowerCase()
    let token: string | null = null
    let tourId: string | null = null
    let description = ''
    let file: File | null = null

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData()
      token = sanitizeId(form.get('token')?.toString() ?? null)
      tourId = sanitizeId(form.get('tour_id')?.toString() ?? null)
      description = (form.get('description')?.toString() || '').trim()
      const fileValue = form.get('file')
      file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null
    } else {
      const raw = await req.json().catch(() => null)
      const parsed = defectBodySchema.safeParse(raw)
      if (!parsed.success) {
        return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
      }
      token = sanitizeId(parsed.data.token)
      tourId = sanitizeId(parsed.data.tour_id)
      description = parsed.data.description.trim()
    }

    if (!token || !tourId || description.length < 3) {
      return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
    }

    const worker = await resolveWorkerFromToken(token)
    if (!worker) return NextResponse.json({ error: 'אין גישה' }, { status: 401 })

    const { data: tour } = await admin
      .from('worker_site_tours')
      .select('id, project_id, notes, defect_ticket_id')
      .eq('id', tourId)
      .eq('client_id', worker.client_id)
      .eq('worker_id', worker.id)
      .maybeSingle()

    if (!tour) return NextResponse.json({ error: 'סיור לא נמצא' }, { status: 404 })
    if ((tour as { defect_ticket_id?: string | null }).defect_ticket_id) {
      return NextResponse.json({ error: 'כבר דווח ליקוי לסיור זה' }, { status: 409 })
    }

    const now = new Date().toISOString()
    const { data: ticket, error: ticketErr } = await admin
      .from('tickets')
      .insert({
        client_id: worker.client_id,
        project_id: tour.project_id,
        description: `ליקוי מסיור: ${description}`,
        status: 'NEW',
        priority: 'MEDIUM',
        source: 'site_tour',
        source_channel: 'worker_portal',
        opened_at: now,
        ticket_metadata: { from_tour_id: tourId },
        assigned_worker_id: worker.id,
      })
      .select('id, ticket_number')
      .single()

    if (ticketErr || !ticket) {
      return NextResponse.json({ error: 'פתיחת תקלה נכשלה' }, { status: 500 })
    }

    if (file) {
      if (!(TICKET_ATTACHMENT_WORKER_MIME_TYPES as readonly string[]).includes(file.type)) {
        return NextResponse.json({ error: 'סוג קובץ לא נתמך' }, { status: 400 })
      }
      if (file.size > TICKET_ATTACHMENT_MAX_WORKER_BYTES) {
        return NextResponse.json({ error: 'קובץ גדול מדי' }, { status: 400 })
      }
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${ticket.id}/${Date.now()}-tour-defect.${ext}`
      const bytes = Buffer.from(await file.arrayBuffer())
      const { error: upErr } = await admin.storage
        .from('ticket-attachments')
        .upload(path, bytes, { contentType: file.type, upsert: false })
      if (!upErr) {
        await admin.from('ticket_attachments').insert({
          ticket_id: ticket.id,
          file_name: file.name,
          file_url: path,
          mime_type: file.type,
          attachment_type: 'tour_defect',
        })
        await admin.from('worker_site_tour_attachments').insert({
          tour_id: tourId,
          client_id: worker.client_id,
          file_name: file.name,
          file_url: path,
          mime_type: file.type,
        })
      }
    }

    const mergedNotes = [tour.notes?.trim(), `ליקוי: ${description}`].filter(Boolean).join('\n')
    await admin
      .from('worker_site_tours')
      .update({ defect_ticket_id: ticket.id, notes: mergedNotes })
      .eq('id', tourId)

    await admin.from('ticket_logs').insert({
      ticket_id: ticket.id,
      action_type: 'OPENED_FROM_TOUR',
      notes: `נפתח מסיור ${tourId}`,
      created_by: 'worker',
      meta: { tour_id: tourId, worker_id: worker.id },
    })

    return NextResponse.json({
      ok: true,
      ticket_id: ticket.id,
      ticket_number: ticket.ticket_number,
    })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
