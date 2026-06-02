import type { SupabaseClient } from '@supabase/supabase-js'
import { getAuditLogger } from '@/lib/logging'
import { logAudit } from '@/lib/audit'

type AuditLogger = ReturnType<typeof getAuditLogger>

export type MergeTicketsParams = {
  supabaseAdmin: SupabaseClient
  clientId: string
  userId: string
  sourceTicketId: string
  targetTicketId: string
  audit: AuditLogger
  requestId: string
}

export type MergeTicketsResult =
  | { ok: true; merged_into_ticket_number: number }
  | { ok: false; status: number; error: string }

export async function mergeTicketsForClient(params: MergeTicketsParams): Promise<MergeTicketsResult> {
  const { supabaseAdmin, clientId, userId, sourceTicketId, targetTicketId, audit, requestId } = params

  if (sourceTicketId === targetTicketId) {
    return { ok: false, status: 400, error: 'לא ניתן למזג תקלה לעצמה' }
  }

  const { data: source, error: sErr } = await supabaseAdmin
    .from('tickets')
    .select('id, ticket_number, project_id, description, status, client_id')
    .eq('id', sourceTicketId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .single()

  if (sErr || !source) {
    return { ok: false, status: 404, error: 'תקלת מקור לא נמצאה' }
  }

  const { data: target, error: tErr } = await supabaseAdmin
    .from('tickets')
    .select('id, ticket_number, project_id, status')
    .eq('id', targetTicketId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .single()

  if (tErr || !target) {
    return { ok: false, status: 404, error: 'תקלת יעד לא נמצאה' }
  }

  if (source.project_id !== target.project_id) {
    return { ok: false, status: 400, error: 'ניתן למזג רק תקלות מאותו בניין' }
  }

  if (source.status === 'CLOSED') {
    return { ok: false, status: 409, error: 'תקלת המקור כבר סגורה' }
  }

  if (target.status === 'CLOSED') {
    return { ok: false, status: 409, error: 'לא ניתן למזג לתקלה סגורה' }
  }

  const mergeNote = `מוזג לתקלה #${target.ticket_number}`
  const newDescription = `${source.description || ''}\n\n${mergeNote}`.trim()

  const { error: upErr } = await supabaseAdmin
    .from('tickets')
    .update({
      status: 'CLOSED',
      closed_at: new Date().toISOString(),
      description: newDescription,
      merged_into_ticket_id: targetTicketId,
      is_merged: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sourceTicketId)
    .eq('client_id', clientId)
    .is('deleted_at', null)

  if (upErr) {
    audit.logFailedOperation('MERGE', 'TICKET', sourceTicketId, clientId, upErr.message)
    return { ok: false, status: 500, error: 'עדכון תקלה נכשל' }
  }

  await supabaseAdmin.from('ticket_logs').insert({
    ticket_id: sourceTicketId,
    action_type: 'TICKET_CLOSED',
    performed_by: 'system',
    notes: mergeNote,
    created_at: new Date().toISOString(),
  })

  audit.logAction('MERGE', 'TICKET', sourceTicketId, clientId, 'dashboard')

  await logAudit({
    clientId,
    userId,
    action: 'MERGE_TICKETS',
    entityType: 'ticket',
    entityId: sourceTicketId,
    oldValues: {
      merged_from_ticket_number: (source as { ticket_number?: number }).ticket_number,
      status: (source as { status?: string }).status,
    },
    newValues: {
      merged_into_ticket_id: targetTicketId,
      merged_into_ticket_number: (target as { ticket_number?: number }).ticket_number,
      status: 'CLOSED',
      is_merged: true,
    },
  })

  return { ok: true, merged_into_ticket_number: target.ticket_number as number }
}
