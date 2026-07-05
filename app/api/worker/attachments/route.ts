import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeId } from '@/lib/api-validation'
import { resolveWorkerFromToken, verifyWorkerOwnsTicket } from '@/lib/worker-token-auth'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'
import { createServerSignedAttachmentUrl } from '@/lib/ticket-attachment-url'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
}

export async function GET(req: NextRequest) {
  try {
    const token = sanitizeId(req.nextUrl.searchParams.get('token'))
    const ticketId = sanitizeId(req.nextUrl.searchParams.get('ticket_id'))
    if (!ticketId) return NextResponse.json({ error: 'ticket_id חסר' }, { status: 400 })

    const worker = await resolveWorkerFromToken(token)
    if (!worker) return NextResponse.json({ error: 'אין גישה' }, { status: 401 })

    const admin = getSupabaseAdmin()
    const owns = await verifyWorkerOwnsTicket(admin, ticketId, worker.id, worker.client_id)
    if (!owns) return NextResponse.json({ error: 'תקלה לא נמצאה' }, { status: 404 })

    const { data, error } = await admin
      .from('ticket_attachments')
      .select('id, file_name, file_url, mime_type, attachment_type, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })

    const attachments = await Promise.all(
      (data || []).map(async (row) => ({
        ...row,
        public_url: row.file_url ? await createServerSignedAttachmentUrl(admin, row.file_url) : null,
      }))
    )

    return NextResponse.json({ attachments })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const ip = clientIp(req)
    const rl = await checkIpPostRouteLimit(admin, ip, 'worker-attachments')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
    }

    const formData = await req.formData()
    const token = sanitizeId(formData.get('token')?.toString() ?? null)
    const ticketId = sanitizeId(formData.get('ticket_id')?.toString() ?? null)
    const file = formData.get('file')

    if (!token || !ticketId || !(file instanceof File)) {
      return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
    }

    const worker = await resolveWorkerFromToken(token)
    if (!worker) return NextResponse.json({ error: 'אין גישה' }, { status: 401 })

    const owns = await verifyWorkerOwnsTicket(admin, ticketId, worker.id, worker.client_id)
    if (!owns) return NextResponse.json({ error: 'תקלה לא נמצאה' }, { status: 404 })

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'קובץ גדול מ-5MB' }, { status: 400 })
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'סוג קובץ לא נתמך' }, { status: 400 })
    }

    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(7)
    const extension = file.name.split('.').pop() || 'jpg'
    const filePath = `${ticketId}/${timestamp}-${randomStr}.${extension}`

    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadError } = await admin.storage
      .from('ticket-attachments')
      .upload(filePath, new Uint8Array(arrayBuffer), { contentType: file.type, upsert: false })

    if (uploadError) {
      return NextResponse.json({ error: 'העלאה נכשלה' }, { status: 500 })
    }

    const { data: row, error: dbError } = await admin
      .from('ticket_attachments')
      .insert({
        ticket_id: ticketId,
        file_name: file.name,
        file_url: filePath,
        mime_type: file.type,
        attachment_type: 'worker_completion',
      })
      .select('id, file_name, file_url, mime_type, attachment_type, created_at')
      .single()

    if (dbError) {
      await admin.storage.from('ticket-attachments').remove([filePath])
      return NextResponse.json({ error: 'שמירה נכשלה' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      attachment: {
        ...row,
        public_url: await createServerSignedAttachmentUrl(admin, filePath),
      },
    })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
