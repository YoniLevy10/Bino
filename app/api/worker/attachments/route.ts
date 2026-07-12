import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeId } from '@/lib/api-validation'
import { resolveWorkerFromToken, verifyWorkerOwnsTicket } from '@/lib/worker-token-auth'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'
import { createServerSignedAttachmentUrl } from '@/lib/ticket-attachment-url'
import { uploadSingleWorkerTicketAttachment } from '@/lib/ticket-attachment-upload'

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

    const uploaded = await uploadSingleWorkerTicketAttachment(admin, ticketId, file)
    if (!uploaded.ok) {
      const status = uploaded.error.includes('נתמך') || uploaded.error.includes('גדול') ? 400 : 500
      return NextResponse.json({ error: uploaded.error }, { status })
    }

    return NextResponse.json({
      ok: true,
      attachment: {
        ...uploaded.row,
        public_url: await createServerSignedAttachmentUrl(admin, uploaded.row.file_url),
      },
    })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
