import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionMinRole } from '@/lib/api-auth'
import { getLogger } from '@/lib/logging'
import { forwardTicketToProfessionalBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { forwardTicketToProfessional } from '@/lib/forward-ticket-to-professional'
import { logAudit } from '@/lib/audit'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { requireClientPaidAddon } from '@/lib/require-paid-addon'

export async function POST(req: Request) {
  const logger = getLogger()
  const requestId = `forward-ticket-pro-${Date.now()}`

  try {
    const auth = await requireSessionMinRole('manager')
    if (!auth.ok) return auth.response

    const rawBody = await req.json()
    const validated = forwardTicketToProfessionalBodySchema.safeParse(rawBody)
    if (!validated.success) {
      return NextResponse.json({ error: validated.error.flatten() }, { status: 400 })
    }

    const { ticket_id, professional_id, note, set_status_escort } = validated.data

    const supabaseAdmin = getSupabaseAdmin()
    const clientId = auth.ctx.clientId

    const addonCheck = await requireClientPaidAddon(
      supabaseAdmin,
      clientId,
      PAID_ADDON_KEYS.professionals
    )
    if (!addonCheck.ok) return addonCheck.response

    const rl = await checkAuthenticatedPostRouteLimit(supabaseAdmin, auth.ctx.userId, 'forward-ticket-to-professional')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    const { data: clientRow } = await supabaseAdmin
      .from('clients')
      .select('sms_sender_name')
      .eq('id', clientId)
      .maybeSingle()

    const smsSenderName =
      (clientRow as { sms_sender_name?: string | null } | null)?.sms_sender_name?.trim() || null

    const { data: ticketBefore } = await supabaseAdmin
      .from('tickets')
      .select('status')
      .eq('id', ticket_id)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .maybeSingle()

    const result = await forwardTicketToProfessional(supabaseAdmin, {
      ticketId: ticket_id,
      professionalId: professional_id,
      clientId,
      note: note ?? null,
      setStatusEscort: set_status_escort !== false,
      smsSenderName,
    })

    if (result.error && !result.sms) {
      const status = result.error.includes('לא נמצא') ? 404 : 400
      return NextResponse.json({ error: result.error, requestId }, { status })
    }

    await logAudit({
      clientId,
      userId: auth.ctx.userId,
      action: 'FORWARD_TICKET_PROFESSIONAL',
      entityType: 'ticket',
      entityId: ticket_id,
      oldValues: { status: (ticketBefore as { status?: string } | null)?.status },
      newValues: {
        professional_id,
        set_status_escort: set_status_escort !== false,
      },
    })

    logger.info('TICKET_API', 'Ticket forwarded to professional', {
      requestId,
      ticket_id,
      professional_id,
      sms_ok: result.sms?.ok,
    })

    return NextResponse.json({
      success: result.ok,
      sms_sent: result.sms?.ok ?? false,
      sms_note: result.smsNote,
      requestId,
    })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error('TICKET_API', 'forward-ticket-to-professional error', err, { requestId })
    return NextResponse.json({ error: 'internal', requestId }, { status: 500 })
  }
}
