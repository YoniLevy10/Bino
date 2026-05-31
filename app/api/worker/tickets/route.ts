import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeId } from '@/lib/api-validation'
import { workerUpdateTicketBodySchema } from '@/lib/api-body-schemas'
import { resolveWorkerFromToken } from '@/lib/worker-token-auth'
import { checkIpPostRouteLimit } from '@/lib/rate-limit'
import { isWorkerSettableStatus } from '@/lib/ticket-status'

export async function GET(req: NextRequest) {
  try {
    const token = sanitizeId(req.nextUrl.searchParams.get('token'))
    const worker = await resolveWorkerFromToken(token)
    if (!worker) {
      return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })
    }

    const admin = getSupabaseAdmin()
    const { data: tickets, error } = await admin
      .from('tickets')
      .select(
        'id, ticket_number, description, status, created_at, priority, reporter_phone, reporter_name, building_number, projects(name, address, address_en)'
      )
      .eq('client_id', worker.client_id)
      .eq('assigned_worker_id', worker.id)
      .is('deleted_at', null)
      .neq('status', 'CLOSED')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
    }

    return NextResponse.json({ tickets: tickets || [], full_name: worker.full_name })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}

function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0]?.trim() || 'unknown'
}

export async function PATCH(req: NextRequest) {
  try {
    const admin = getSupabaseAdmin()
    const ip = clientIp(req)
    const rl = await checkIpPostRouteLimit(admin, ip, 'worker-tickets-patch')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
    }

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return NextResponse.json({ error: 'גוף לא תקין' }, { status: 400 })
    }

    const parsed = workerUpdateTicketBodySchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json({ error: 'בקשה לא תקינה', details: parsed.error.flatten() }, { status: 400 })
    }

    const token = sanitizeId(parsed.data.token)
    const ticketId = sanitizeId(parsed.data.ticket_id)
    const status = parsed.data.status

    if (!token || !ticketId || !isWorkerSettableStatus(status)) {
      return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
    }

    const worker = await resolveWorkerFromToken(token)
    if (!worker) {
      return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })
    }

    const payload: Record<string, string | null> = {
      status,
      updated_at: new Date().toISOString(),
    }
    if (status === 'CLOSED') {
      payload.closed_at = new Date().toISOString()
    } else {
      payload.closed_at = null
    }

    const { data: updated, error } = await admin
      .from('tickets')
      .update(payload)
      .eq('id', ticketId)
      .eq('client_id', worker.client_id)
      .eq('assigned_worker_id', worker.id)
      .is('deleted_at', null)
      .select('id, status')
      .maybeSingle()

    if (error) {
      console.error('[worker/tickets PATCH]', error.message, error.code, { ticketId, status })
      return NextResponse.json({ error: 'עדכון נכשל', details: error.message }, { status: 400 })
    }
    if (!updated) {
      return NextResponse.json({ error: 'תקלה לא נמצאה או שאינה משויכת אליך' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, ticket: updated })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
