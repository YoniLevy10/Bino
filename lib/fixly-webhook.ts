import { createHmac, timingSafeEqual } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getBamakorWebhookSecret,
  getFixlyStatusPresentation,
  mapFixlyStatusToTicketStatus,
} from '@/lib/fixly'
import { getLogger } from '@/lib/logging'

export type FixlyWebhookPayload = {
  event: string
  job_id: string
  status: string
  previous_status: string | null
  external_ref: { system: string; ticket_id: string } | null
  provider: {
    id: string
    name: string
    phone: string | null
    category: string | null
  } | null
  occurred_at: string
}

export function verifyFixlyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = getBamakorWebhookSecret()
  if (!secret) return false

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const sigRaw = (signatureHeader || '').replace(/^sha256=/i, '').trim()
  if (!sigRaw) return false

  const a = Buffer.from(expected, 'utf8')
  const b = Buffer.from(sigRaw, 'utf8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function applyFixlyWebhookUpdate(
  supabase: SupabaseClient,
  payload: FixlyWebhookPayload
): Promise<{ ok: boolean; ignored?: boolean; error?: string }> {
  const logger = getLogger()

  if (!payload.external_ref || payload.external_ref.system !== 'bamakor') {
    return { ok: true, ignored: true }
  }

  const ticketId = payload.external_ref.ticket_id
  if (!ticketId) {
    return { ok: false, error: 'missing_ticket_id' }
  }

  const { data: ticket, error: ticketErr } = await supabase
    .from('tickets')
    .select('id, status, client_id, fixly_job_id')
    .eq('id', ticketId)
    .is('deleted_at', null)
    .maybeSingle()

  if (ticketErr || !ticket) {
    return { ok: false, error: 'ticket_not_found' }
  }

  if (ticket.fixly_job_id && payload.job_id && ticket.fixly_job_id !== payload.job_id) {
    logger.warn('FIXLY', 'Webhook job_id mismatch', {
      ticketId,
      expected: ticket.fixly_job_id,
      got: payload.job_id,
    })
  }

  const presentation = getFixlyStatusPresentation(payload.status)
  const mappedStatus = mapFixlyStatusToTicketStatus(payload.status)

  const updateData: Record<string, unknown> = {
    fixly_status: payload.status,
    fixly_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  if (payload.provider) {
    updateData.fixly_provider_name = payload.provider.name
    updateData.fixly_provider_phone = payload.provider.phone
  }

  if (mappedStatus === 'CLOSED') {
    updateData.status = 'CLOSED'
    updateData.closed_at = new Date().toISOString()
  } else if (mappedStatus === 'NEW') {
    // Re-open only if ticket was closed or in Fixly escort flow
    if (ticket.status === 'CLOSED' || ticket.status === 'PROFESSIONAL_ESCORT') {
      updateData.status = 'NEW'
      updateData.closed_at = null
    }
  } else if (mappedStatus) {
    updateData.status = mappedStatus
  }

  const { error: updateErr } = await supabase.from('tickets').update(updateData).eq('id', ticketId)
  if (updateErr) {
    logger.error('FIXLY', 'Webhook ticket update failed', updateErr, { ticketId })
    return { ok: false, error: 'update_failed' }
  }

  const providerSuffix = payload.provider?.name ? ` — ${payload.provider.name}` : ''
  const { error: logErr } = await supabase.from('ticket_logs').insert({
    ticket_id: ticketId,
    action_type: 'FIXLY_STATUS_UPDATE',
    notes: `Fixly: ${presentation.labelHe}${providerSuffix}`,
    created_by: 'fixly_webhook',
    old_value: payload.previous_status,
    new_value: payload.status,
    meta: {
      fixly_status: payload.status,
      previous_status: payload.previous_status,
      provider: payload.provider,
      job_id: payload.job_id,
      occurred_at: payload.occurred_at,
      event: payload.event,
    },
  })

  if (logErr) {
    logger.warn('FIXLY', 'ticket_logs insert failed on webhook', { err: logErr.message })
  }

  return { ok: true }
}
