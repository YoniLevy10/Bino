import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { recoverStashedWhatsAppMediaToTicket } from '@/lib/whatsapp-recover-stashed-media'
import { fetchTicketReporterPhone } from '@/lib/whatsapp-ticket-reply'

const bodySchema = z.object({
  ticket_id: z.string().uuid(),
})

/** Try to attach WhatsApp media that was stashed in session to an open ticket. */
export async function POST(req: Request) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'recover-whatsapp-media')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות — נסו שוב בעוד דקה' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { ticket_id: ticketId } = parsed.data
  const clientId = auth.ctx.clientId

  const { data: ticket } = await admin
    .from('tickets')
    .select('id, status, reporter_phone')
    .eq('id', ticketId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!ticket) {
    return NextResponse.json({ error: 'תקלה לא נמצאה' }, { status: 404 })
  }

  if (ticket.status === 'CLOSED') {
    return NextResponse.json({ error: 'התקלה סגורה' }, { status: 400 })
  }

  const reporterPhone = await fetchTicketReporterPhone(admin, ticketId, clientId)
  if (!reporterPhone) {
    return NextResponse.json({ error: 'אין טלפון דייר לתקלה' }, { status: 400 })
  }

  const { data: clientRow } = await admin
    .from('clients')
    .select('whatsapp_access_token')
    .eq('id', clientId)
    .maybeSingle()

  const accessToken = (clientRow as { whatsapp_access_token?: string | null } | null)?.whatsapp_access_token ?? undefined

  const result = await recoverStashedWhatsAppMediaToTicket(
    admin,
    clientId,
    ticketId,
    reporterPhone,
    accessToken
  )

  if (!result.recovered) {
    const messages: Record<string, string> = {
      NO_STASHED_MEDIA: 'לא נמצאה תמונה/וידאו שמורים בסשן — בקשו מהדייר/ת לשלוח שוב',
      MISSING_ACCESS_TOKEN: 'חסר WhatsApp access token בהגדרות',
      ATTACH_FAILED: 'הורדת המדיה מ-Meta נכשלה (ייתכן שפג תוקף) — בקשו לשלוח שוב',
      SESSION_LOOKUP_FAILED: 'שגיאה בחיפוש סשן',
    }
    return NextResponse.json(
      { recovered: false, reason: result.reason, error: messages[result.reason ?? ''] ?? 'שחזור נכשל' },
      { status: result.reason === 'NO_STASHED_MEDIA' ? 404 : 502 }
    )
  }

  return NextResponse.json({ recovered: true })
}
