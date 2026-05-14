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
      .select('id, ticket_number, description, status, created_at, projects(name)')
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

type PatchBody = { token?: unknown; ticket_id?: unknown; status?: unknown }

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as PatchBody
    const token = sanitizeId(body.token)
    const ticketId = sanitizeId(body.ticket_id)
    const status = body.status === 'IN_PROGRESS' || body.status === 'CLOSED' ? body.status : null

    if (!token || !ticketId || !status) {
      return NextResponse.json({ error: 'בקשה לא תקינה' }, { status: 400 })
    }

    const worker = await resolveWorkerFromToken(token)
    if (!worker) {
      return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })
    }

    const admin = getSupabaseAdmin()
    const payload: Record<string, string | null> = { status }
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

    if (error || !updated) {
      return NextResponse.json({ error: 'עדכון נכשל' }, { status: 400 })
    }

    return NextResponse.json({ ok: true, ticket: updated })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
