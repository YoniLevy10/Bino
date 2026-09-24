import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getLogger } from '@/lib/logging'
import { authorizeFixlyWebhook } from '@/lib/fixly-client'
import { FIXLY_JOB_STATUSES, type FixlyJobStatus, type FixlyWebhookEvent } from '@/lib/fixly-types'
import { mergeFixlyMetadata, readFixlyMetadata } from '@/lib/fixly-ticket-metadata'

function isAuthorized(req: Request): boolean {
  const url = new URL(req.url)
  return authorizeFixlyWebhook({
    expectedSecret: process.env.FIXLY_WEBHOOK_SECRET,
    tokenFromQuery: url.searchParams.get('token'),
    tokenFromHeader: req.headers.get('x-webhook-token'),
  })
}

function parseEvent(body: unknown): FixlyWebhookEvent | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const row = body as Record<string, unknown>
  const fixlyJobId = typeof row.fixly_job_id === 'string' ? row.fixly_job_id.trim() : ''
  const binoTicketId = typeof row.bino_ticket_id === 'string' ? row.bino_ticket_id.trim() : ''
  const status = typeof row.status === 'string' ? row.status.trim() : ''
  if (!fixlyJobId || !binoTicketId || !status) return null
  if (!(FIXLY_JOB_STATUSES as readonly string[]).includes(status)) return null
  return {
    event_id: typeof row.event_id === 'string' ? row.event_id : undefined,
    fixly_job_id: fixlyJobId,
    bino_ticket_id: binoTicketId,
    status: status as FixlyJobStatus,
    professional_name: typeof row.professional_name === 'string' ? row.professional_name : null,
    professional_phone: typeof row.professional_phone === 'string' ? row.professional_phone : null,
    note: typeof row.note === 'string' ? row.note : null,
    occurred_at: typeof row.occurred_at === 'string' ? row.occurred_at : null,
  }
}

export async function GET() {
  return NextResponse.json({ ok: true })
}

export async function POST(req: Request) {
  const logger = getLogger()
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const event = parseEvent(body)
    if (!event) {
      return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()
    const { data: ticket, error } = await admin
      .from('tickets')
      .select('id, client_id, status, ticket_metadata')
      .eq('id', event.bino_ticket_id)
      .is('deleted_at', null)
      .maybeSingle()

    if (error || !ticket) {
      return NextResponse.json({ error: 'ticket not found' }, { status: 404 })
    }

    const existing = readFixlyMetadata(ticket.ticket_metadata)
    if (existing?.job_id && existing.job_id !== event.fixly_job_id) {
      return NextResponse.json({ error: 'job mismatch' }, { status: 409 })
    }

    if (existing?.last_event_id && event.event_id && existing.last_event_id === event.event_id) {
      return NextResponse.json({ ok: true, duplicate: true })
    }

    const now = new Date().toISOString()
    const nextMeta = mergeFixlyMetadata(ticket.ticket_metadata, {
      job_id: event.fixly_job_id,
      launched_at: existing?.launched_at || now,
      last_status: event.status,
      last_event_id: event.event_id || existing?.last_event_id || null,
      professional_name: event.professional_name ?? existing?.professional_name ?? null,
      professional_phone: event.professional_phone ?? existing?.professional_phone ?? null,
      trade: existing?.trade,
    })

    // Status updates: keep escort while in progress; do not auto-close on completed.
    const patch: Record<string, unknown> = {
      ticket_metadata: nextMeta,
      updated_at: now,
    }
    if (
      event.status === 'claimed' ||
      event.status === 'assigned' ||
      event.status === 'en_route' ||
      event.status === 'arrived' ||
      event.status === 'in_progress'
    ) {
      if (ticket.status !== 'CLOSED') {
        patch.status = 'PROFESSIONAL_ESCORT'
      }
    }

    const { error: updateError } = await admin
      .from('tickets')
      .update(patch)
      .eq('id', event.bino_ticket_id)

    if (updateError) {
      logger.warn('FIXLY', 'webhook ticket update failed', { err: updateError.message })
      return NextResponse.json({ error: 'update failed' }, { status: 500 })
    }

    await admin.from('ticket_logs').insert({
      ticket_id: event.bino_ticket_id,
      action_type: 'FIXLY_STATUS',
      notes:
        event.note?.trim() ||
        `Fixly: ${event.status}${event.professional_name ? ` · ${event.professional_name}` : ''}`,
      created_by: 'system',
      meta: {
        fixly_job_id: event.fixly_job_id,
        status: event.status,
        event_id: event.event_id || null,
        professional_name: event.professional_name || null,
        professional_phone: event.professional_phone || null,
        occurred_at: event.occurred_at || now,
      },
    })

    if (event.status === 'expired' || event.status === 'cancelled') {
      logger.info('FIXLY', 'Job ended without completion', {
        ticketId: event.bino_ticket_id,
        status: event.status,
      })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    logger.error('FIXLY', 'webhook error', err)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
