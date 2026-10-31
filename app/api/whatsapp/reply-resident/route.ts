import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireSessionWriteAccess } from '@/lib/api-auth'
import { whatsappReplyResidentBodySchema } from '@/lib/whatsapp-api-schemas'
import { sendTicketResidentWhatsAppReply } from '@/lib/whatsapp-ticket-reply'
import { insertWhatsAppSendFailure } from '@/lib/error-logs-db'
import { isShabbatMessagingSkipMessage } from '@/lib/shabbat-messaging-gate'
import { WHATSAPP_SKIP_STATUS_SHABBAT } from '@/lib/whatsapp-meta-errors'

export async function POST(req: Request) {
  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'whatsapp-reply-resident')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const parsed = whatsappReplyResidentBodySchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { data: ticket } = await admin
    .from('tickets')
    .select('id')
    .eq('id', parsed.data.ticket_id)
    .eq('client_id', auth.ctx.clientId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!ticket) {
    return NextResponse.json({ error: 'תקלה לא נמצאה' }, { status: 404 })
  }

  const result = await sendTicketResidentWhatsAppReply(admin, {
    clientId: auth.ctx.clientId,
    ticketId: parsed.data.ticket_id,
    body: parsed.data.body,
  })

  if (!result.sent) {
    if (result.reporterPhone) {
      const errMsg = result.errorMessage ?? 'ticket reply failed'
      const shabbat = isShabbatMessagingSkipMessage(errMsg)
      await insertWhatsAppSendFailure(
        auth.ctx.clientId,
        result.reporterPhone,
        parsed.data.body,
        errMsg,
        {
          send_kind: 'ticket_reply',
          ticket_id: parsed.data.ticket_id,
          meta_error_code: result.metaErrorCode,
          meta_http_status: result.metaHttpStatus,
          ...(shabbat ? { skip_status: WHATSAPP_SKIP_STATUS_SHABBAT } : {}),
        }
      )
    }
    return NextResponse.json(
      {
        error: result.errorMessage ?? 'שליחת WhatsApp נכשלה',
        code: result.metaErrorCode,
        meta_http_status: result.metaHttpStatus,
      },
      { status: 502 }
    )
  }

  return NextResponse.json({
    ok: true,
    mode: result.mode,
    reporter_phone: result.reporterPhone,
    fallback_from_template: result.fallbackFromTemplate ?? false,
  })
}
