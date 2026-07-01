import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeId } from '@/lib/api-validation'
import { resolveWorkerFromToken, verifyWorkerOwnsTicket } from '@/lib/worker-token-auth'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'
import { workerWhatsappReplyBodySchema } from '@/lib/api-body-schemas'
import { listTicketWhatsAppMessages, sendTicketResidentWhatsAppReply } from '@/lib/whatsapp-ticket-reply'
import { insertWhatsAppSendFailure } from '@/lib/error-logs-db'

function clientIp(req: Request): string {
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

    const thread = await listTicketWhatsAppMessages(admin, worker.client_id, ticketId)
    return NextResponse.json({
      messages: thread.messages,
      conversation_id: thread.conversation_id,
    })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req)
    const admin = getSupabaseAdmin()
    const rl = await checkIpPostRouteLimit(admin, ip, 'worker-whatsapp-reply')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
    }

    const parsed = workerWhatsappReplyBodySchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    }

    const worker = await resolveWorkerFromToken(sanitizeId(parsed.data.token))
    if (!worker) return NextResponse.json({ error: 'אין גישה' }, { status: 401 })

    const owns = await verifyWorkerOwnsTicket(admin, parsed.data.ticket_id, worker.id, worker.client_id)
    if (!owns) return NextResponse.json({ error: 'תקלה לא נמצאה' }, { status: 404 })

    const result = await sendTicketResidentWhatsAppReply(admin, {
      clientId: worker.client_id,
      ticketId: parsed.data.ticket_id,
      body: parsed.data.body,
    })

    if (!result.sent) {
      if (result.reporterPhone) {
        await insertWhatsAppSendFailure(
          worker.client_id,
          result.reporterPhone,
          parsed.data.body,
          result.errorMessage ?? 'worker ticket reply failed',
          { send_kind: 'worker_ticket_reply', ticket_id: parsed.data.ticket_id, worker_id: worker.id }
        )
      }
      return NextResponse.json(
        { error: result.errorMessage ?? 'שליחת WhatsApp נכשלה', code: result.metaErrorCode },
        { status: 502 }
      )
    }

    return NextResponse.json({
      ok: true,
      mode: result.mode,
      reporter_phone: result.reporterPhone,
    })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
