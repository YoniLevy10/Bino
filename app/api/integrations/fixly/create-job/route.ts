import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { getLogger } from '@/lib/logging'
import { createFixlyJobBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { createFixlyJobForTicket } from '@/lib/fixly-create-job'
import { logAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/** POST /api/integrations/fixly/create-job — publish a ticket to Fixly */
export async function POST(req: Request) {
  const logger = getLogger()
  const requestId = `fixly-create-${Date.now()}`

  try {
    const auth = await requireSessionClientId()
    if (!auth.ok) return auth.response

    const rawBody = await req.json().catch(() => null)
    const validated = createFixlyJobBodySchema.safeParse(rawBody)
    if (!validated.success) {
      return NextResponse.json({ error: validated.error.flatten(), requestId }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(supabaseAdmin, auth.ctx.userId, 'fixly-create-job')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    const body = validated.data
    const result = await createFixlyJobForTicket(supabaseAdmin, {
      ticketId: body.ticket_id,
      clientId: auth.ctx.clientId,
      category: body.category,
      priority: body.priority,
      notes: body.notes,
      assignmentMode: body.assignment_mode,
      cityOverride: body.city,
      managerPhoneOverride: body.manager_phone,
      reporterPhoneOverride: body.reporter_phone,
    })

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, detail: result.detail, requestId },
        { status: result.status || 400 }
      )
    }

    await logAudit({
      clientId: auth.ctx.clientId,
      userId: auth.ctx.userId,
      action: 'FIXLY_PUBLISH_TICKET',
      entityType: 'ticket',
      entityId: body.ticket_id,
      newValues: {
        job_id: result.job_id,
        status: result.status,
        already_published: result.already_published ?? false,
      },
    })

    logger.info('FIXLY', 'Ticket published to Fixly', {
      requestId,
      ticket_id: body.ticket_id,
      job_id: result.job_id,
      already_published: result.already_published ?? false,
    })

    return NextResponse.json({
      ok: true,
      already_published: result.already_published ?? false,
      job_id: result.job_id,
      status: result.status,
      matched_providers: result.matched_providers ?? null,
      requestId,
    })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error('FIXLY', 'create-job route error', err, { requestId })
    return NextResponse.json({ error: 'internal', requestId }, { status: 500 })
  }
}
