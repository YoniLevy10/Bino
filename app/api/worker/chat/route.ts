import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeId } from '@/lib/api-validation'
import { resolveWorkerFromToken, verifyWorkerOwnsTicket } from '@/lib/worker-token-auth'

export async function GET(req: NextRequest) {
  try {
    const token = sanitizeId(req.nextUrl.searchParams.get('token'))
    const ticketId = sanitizeId(req.nextUrl.searchParams.get('ticket_id'))
    if (!ticketId) return NextResponse.json({ error: 'ticket_id חסר' }, { status: 400 })

    const worker = await resolveWorkerFromToken(token)
    if (!worker) return NextResponse.json({ error: 'אין גישה' }, { status: 401 })

    const admin = getSupabaseAdmin()
    const owns = await verifyWorkerOwnsTicket(admin, ticketId, worker.id, worker.client_id)
    if (!owns) return NextResponse.json({ error: 'תקלה לא נמצאה' }, { status: 404 })

    const { data: messages, error } = await admin
      .from('ticket_internal_messages')
      .select('id, sender_name, body, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
    return NextResponse.json({ messages: messages || [] })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { token?: unknown; ticket_id?: unknown; body?: unknown }
    const token = sanitizeId(body.token)
    const ticketId = sanitizeId(body.ticket_id)
    const messageBody = typeof body.body === 'string' ? body.body.trim().slice(0, 4000) : ''

    if (!ticketId || !messageBody) {
      return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
    }

    const worker = await resolveWorkerFromToken(token)
    if (!worker) return NextResponse.json({ error: 'אין גישה' }, { status: 401 })

    const admin = getSupabaseAdmin()
    const owns = await verifyWorkerOwnsTicket(admin, ticketId, worker.id, worker.client_id)
    if (!owns) return NextResponse.json({ error: 'תקלה לא נמצאה' }, { status: 404 })

    const { error } = await admin
      .from('ticket_internal_messages')
      .insert({
        ticket_id: ticketId,
        client_id: worker.client_id,
        sender_name: worker.full_name,
        body: messageBody,
      })

    if (error) return NextResponse.json({ error: 'שליחה נכשלה' }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
