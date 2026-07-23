/**
 * Alias merge endpoint: POST body { source_id, target_id } → canonical merge-ticket logic.
 */
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { mergeTicketsByIdBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireSessionMinRole } from '@/lib/api-auth'
import { getLogger, getAuditLogger } from '@/lib/logging'
import { mergeTicketsForClient } from '@/lib/merge-tickets'

export async function POST(req: Request) {
  const logger = getLogger()
  const audit = getAuditLogger()
  const requestId = `tickets-merge-${Date.now()}`
  try {
    let supabaseAdmin
    try {
      supabaseAdmin = getSupabaseAdmin()
    } catch (envError) {
      console.error('[tickets/merge]', envError)
      return NextResponse.json({ error: 'internal' }, { status: 500 })
    }

    const auth = await requireSessionMinRole('manager')
    if (!auth.ok) return auth.response
    const bamakorClientId = auth.ctx.clientId

    const rl = await checkAuthenticatedPostRouteLimit(supabaseAdmin, auth.ctx.userId, 'merge-ticket')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.', requestId }, { status: 429 })
    }

    const rawBody = await req.json()
    const validated = mergeTicketsByIdBodySchema.safeParse(rawBody)
    if (!validated.success) {
      return NextResponse.json({ error: validated.error.flatten() }, { status: 400 })
    }

    const result = await mergeTicketsForClient({
      supabaseAdmin,
      clientId: bamakorClientId,
      userId: auth.ctx.userId,
      sourceTicketId: validated.data.source_id,
      targetTicketId: validated.data.target_id,
      audit,
      requestId,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error, requestId }, { status: result.status })
    }

    return NextResponse.json({ success: true, merged_into_ticket_number: result.merged_into_ticket_number, requestId })
  } catch (e) {
    console.error('[tickets/merge]', e)
    logger.error('TICKET_API', 'Unhandled tickets/merge error', e instanceof Error ? e : new Error(String(e)), {
      requestId,
    })
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
