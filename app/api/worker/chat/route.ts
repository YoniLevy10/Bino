import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeId } from '@/lib/api-validation'

async function resolveWorkerFromToken(token: string | null) {
  if (!token) return null
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from('workers')
    .select('id, client_id, full_name, is_active')
    .eq('access_token', token)
    .is('deleted_at', null)
    .maybeSingle()
  if (error || !data || !data.is_active) return null
  return data as { id: string; client_id: string; full_name: string }
}

async function verifyWorkerOwnsTicket(admin: ReturnType<typeof getSupabaseAdmin>, ticketId: string, workerId: string, clientId: string) {
  const { data } = await admin
    .from('tickets')
    .select('id')
    .eq('id', ticketId)
    .eq('client_id', clientId)
    .eq('assigned_worker_id', workerId)
    .is('deleted_at', null)
    .maybeSingle()
  return !!data
}

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
