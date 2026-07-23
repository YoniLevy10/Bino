import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { mergeTicketsBodySchema } from '@/lib/api-body-schemas'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireSessionMinRole } from '@/lib/api-auth'
import { getLogger, getAuditLogger } from '@/lib/logging'
import { mergeTicketsForClient } from '@/lib/merge-tickets'

export async function POST(req: Request) {
  const logger = getLogger()
  const audit = getAuditLogger()
  const requestId = `merge-ticket-${Date.now()}`
  try {
    let supabaseAdmin
    try {
      supabaseAdmin = getSupabaseAdmin()
    } catch (envError) {
      console.error('[merge-ticket]', envError)
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
    const validated = mergeTicketsBodySchema.safeParse(rawBody)
    if (!validated.success) {
      return NextResponse.json({ error: validated.error.flatten() }, { status: 400 })
    }
    const { source_ticket_id: sourceTicketId, target_ticket_id: targetTicketId } = validated.data

    const result = await mergeTicketsForClient({
      supabaseAdmin,
      clientId: bamakorClientId,
      userId: auth.ctx.userId,
      sourceTicketId,
      targetTicketId,
      audit,
      requestId,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error, requestId }, { status: result.status })
    }

    return NextResponse.json({ success: true, merged_into_ticket_number: result.merged_into_ticket_number, requestId })
  } catch (e) {
    console.error('[merge-ticket]', e)
    logger.error('TICKET_API', 'Unhandled merge-ticket error', e instanceof Error ? e : new Error(String(e)), { requestId })
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
