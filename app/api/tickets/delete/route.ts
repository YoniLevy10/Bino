import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { deleteTicketsBodySchema } from '@/lib/api-body-schemas'
import { logAudit } from '@/lib/audit'
import { getLogger } from '@/lib/logging'
import { softDeleteTicketsForClient } from '@/lib/ticket-soft-delete'

export async function POST(req: Request) {
  const logger = getLogger()
  const requestId = `delete-tickets-${Date.now()}`

  try {
    const auth = await requireSessionClientId()
    if (!auth.ok) return auth.response
    const clientId = auth.ctx.clientId

    const admin = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'delete-tickets')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    const rawBody = await req.json().catch(() => ({}))
    const validated = deleteTicketsBodySchema.safeParse(rawBody)
    if (!validated.success) {
      return NextResponse.json({ error: validated.error.flatten() }, { status: 400 })
    }

    const body = validated.data
    const result = await softDeleteTicketsForClient(
      admin,
      clientId,
      'delete_all' in body ? { deleteAll: true } : { ticketIds: body.ticket_ids }
    )

    if (result.error) {
      logger.error('TICKET_API', 'Delete tickets failed', new Error(result.error), { requestId, clientId })
      return NextResponse.json({ error: 'מחיקה נכשלה', requestId }, { status: 500 })
    }

    if (result.deleted_count === 0) {
      return NextResponse.json({ success: true, deleted_count: 0, requestId })
    }

    await logAudit({
      clientId,
      userId: auth.ctx.userId,
      action: 'delete_all' in body ? 'DELETE_ALL_TICKETS' : 'DELETE_TICKETS',
      entityType: 'ticket',
      entityId: result.ticket_ids[0] ?? null,
      newValues: {
        deleted_count: result.deleted_count,
        ticket_ids: result.ticket_ids.slice(0, 50),
        delete_all: 'delete_all' in body,
      },
    })

    logger.info('TICKET_API', 'Tickets soft-deleted', {
      requestId,
      clientId,
      deleted_count: result.deleted_count,
    })

    return NextResponse.json({
      success: true,
      deleted_count: result.deleted_count,
      requestId,
    })
  } catch (e) {
    logger.error(
      'TICKET_API',
      'Delete tickets route error',
      e instanceof Error ? e : new Error(String(e)),
      { requestId }
    )
    return NextResponse.json({ error: 'שגיאת שרת', requestId }, { status: 500 })
  }
}
