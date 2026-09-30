import { NextResponse } from 'next/server'
import { requireResidentContext } from '@/lib/resident-portal/context'

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireResidentContext({ request: req })
  if (!auth.ok) return auth.response
  const { id } = await ctx.params

  const { data: ticket, error } = await auth.ctx.admin
    .from('tickets')
    .select(
      'id, ticket_number, status, description, scope, opened_at, closed_at, updated_at, created_at'
    )
    .eq('id', id)
    .eq('client_id', auth.ctx.membership.client_id)
    .eq('reporter_membership_id', auth.ctx.membership.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) {
    console.error('[resident/tickets/id]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!ticket) {
    return NextResponse.json({ error: 'קריאה לא נמצאה' }, { status: 404 })
  }

  const { data: messages, error: mErr } = await auth.ctx.admin
    .from('ticket_resident_messages')
    .select('id, author_type, body, created_at')
    .eq('ticket_id', ticket.id)
    .eq('client_id', auth.ctx.membership.client_id)
    .order('created_at', { ascending: true })
    .limit(100)

  if (mErr) {
    console.error('[resident/tickets/messages]', mErr.message)
    return NextResponse.json({ error: mErr.message }, { status: 500 })
  }

  // Explicitly do NOT return ticket_internal_messages
  return NextResponse.json({ ticket, messages: messages ?? [] })
}
