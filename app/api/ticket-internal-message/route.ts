import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionMinRole } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { ticketInternalMessageBodySchema } from '@/lib/api-body-schemas'
import { sanitizeString } from '@/lib/api-validation'
import { getLogger } from '@/lib/logging'

export async function POST(req: Request) {
  const logger = getLogger()
  const requestId = `ticket-internal-message-${Date.now()}`

  try {
    const auth = await requireSessionMinRole('manager')
    if (!auth.ok) return auth.response
    const clientId = auth.ctx.clientId

    const admin = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'ticket-internal-message')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    const rawBody = await req.json().catch(() => null)
    const validated = ticketInternalMessageBodySchema.safeParse(rawBody)
    if (!validated.success) {
      return NextResponse.json({ error: validated.error.flatten() }, { status: 400 })
    }

    const { ticket_id, sender_name, body } = validated.data

    const { data: ticket } = await admin
      .from('tickets')
      .select('id')
      .eq('id', ticket_id)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!ticket) {
      return NextResponse.json({ error: 'תקלה לא נמצאה', requestId }, { status: 404 })
    }

    const { data: row, error } = await admin
      .from('ticket_internal_messages')
      .insert({
        ticket_id,
        client_id: clientId,
        sender_name: sanitizeString(sender_name),
        body: sanitizeString(body),
      })
      .select('id, ticket_id, client_id, sender_name, body, created_at')
      .single()

    if (error) {
      logger.error('TICKET_API', 'Internal message insert failed', new Error(error.message), { requestId, ticket_id })
      return NextResponse.json({ error: 'שליחה נכשלה', requestId }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: row, requestId })
  } catch (e) {
    logger.error('TICKET_API', 'ticket-internal-message error', e instanceof Error ? e : new Error(String(e)), {
      requestId,
    })
    return NextResponse.json({ error: 'שגיאת שרת', requestId }, { status: 500 })
  }
}
