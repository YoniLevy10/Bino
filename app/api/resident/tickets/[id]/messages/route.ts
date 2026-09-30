import { NextResponse } from 'next/server'
import { requireResidentContext } from '@/lib/resident-portal/context'

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireResidentContext({ request: req })
  if (!auth.ok) return auth.response
  const { id } = await ctx.params

  let body: { body?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'גוף בקשה לא תקין' }, { status: 400 })
  }
  const text = typeof body.body === 'string' ? body.body.trim() : ''
  if (text.length < 1) {
    return NextResponse.json({ error: 'הודעה ריקה' }, { status: 400 })
  }

  const { data: ticket, error } = await auth.ctx.admin
    .from('tickets')
    .select('id')
    .eq('id', id)
    .eq('client_id', auth.ctx.membership.client_id)
    .eq('reporter_membership_id', auth.ctx.membership.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!ticket) return NextResponse.json({ error: 'קריאה לא נמצאה' }, { status: 404 })

  const { data: msg, error: iErr } = await auth.ctx.admin
    .from('ticket_resident_messages')
    .insert({
      ticket_id: ticket.id,
      client_id: auth.ctx.membership.client_id,
      membership_id: auth.ctx.membership.id,
      author_type: 'resident',
      author_user_id: auth.ctx.userId,
      body: text,
    })
    .select('id, author_type, body, created_at')
    .single()

  if (iErr) {
    console.error('[resident/tickets/messages POST]', iErr.message)
    return NextResponse.json({ error: iErr.message }, { status: 500 })
  }

  return NextResponse.json({ message: msg })
}
