import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWorkerSMSAll, type WorkerSmsBatchResult } from '@/lib/sms-send'
import { collectWorkerPhones, type WorkerPhoneSource } from '@/lib/worker-phones'
import { getLogger } from '@/lib/logging'

export type ForwardTicketToProfessionalResult = {
  ok: boolean
  sms: WorkerSmsBatchResult | null
  smsNote?: string
  error?: string
}

function truncateForSms(text: string, maxLen: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen - 3)}...`
}

/**
 * Sends ticket details to an external professional via SMS and logs the action.
 */
export async function forwardTicketToProfessional(
  supabase: SupabaseClient,
  params: {
    ticketId: string
    professionalId: string
    clientId: string
    note?: string | null
    setStatusEscort?: boolean
    smsSenderName?: string | null
  }
): Promise<ForwardTicketToProfessionalResult> {
  const logger = getLogger()
  const { ticketId, professionalId, clientId, note, setStatusEscort = true, smsSenderName } = params

  const { data: ticket, error: ticketError } = await supabase
    .from('tickets')
    .select(`
      id,
      ticket_number,
      description,
      reporter_phone,
      status,
      client_id,
      projects (name, project_code)
    `)
    .eq('id', ticketId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .single()

  if (ticketError || !ticket) {
    return { ok: false, sms: null, error: 'Ticket not found' }
  }

  const { data: professional, error: proError } = await supabase
    .from('professionals')
    .select('id, full_name, phone, extra_phones, trade, is_active')
    .eq('id', professionalId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .single()

  if (proError || !professional) {
    return { ok: false, sms: null, error: 'Professional not found' }
  }

  if (!(professional as { is_active?: boolean }).is_active) {
    return { ok: false, sms: null, error: 'איש המקצוע אינו פעיל' }
  }

  const phones = collectWorkerPhones(professional as WorkerPhoneSource)
  if (phones.length === 0) {
    return { ok: false, sms: null, error: 'לאיש המקצוע אין מספר טלפון במערכת' }
  }

  const project = Array.isArray(ticket.projects) ? ticket.projects[0] : ticket.projects
  const buildingName = (project as { name?: string } | null)?.name?.trim() || 'ללא שם בניין'
  const ticketNumber = ticket.ticket_number as number
  const description = truncateForSms((ticket.description as string | null) || 'ללא תיאור', 200)
  const reporterPhone = (ticket.reporter_phone as string | null)?.trim() || 'לא ידוע'
  const proName = (professional as { full_name: string }).full_name
  const trade = (professional as { trade?: string | null }).trade?.trim()
  const noteTrim = note?.trim()

  let smsBody = `הועברה אליכם תקלה #${ticketNumber} ב${buildingName}. ${description}. טלפון מדווח: ${reporterPhone}.`
  if (trade) smsBody += ` תחום: ${trade}.`
  if (noteTrim) smsBody += ` הערה: ${truncateForSms(noteTrim, 120)}.`

  let sms: WorkerSmsBatchResult | null = null
  let smsNote: string | undefined

  try {
    const batch = await sendWorkerSMSAll(phones, smsBody, smsSenderName, clientId)
    sms = batch
    if (!batch.ok && batch.sent > 0) {
      smsNote = `SMS נשלח ל-${batch.sent} מתוך ${batch.total} מספרים.`
    } else if (!batch.ok) {
      smsNote = 'שליחת SMS נכשלה.'
    }
  } catch (sendError) {
    smsNote = 'שגיאה בשליחת SMS.'
    logger.warn('FORWARD_PRO', 'SMS error', {
      err: sendError instanceof Error ? sendError.message : String(sendError),
    })
    return { ok: false, sms: null, smsNote, error: smsNote }
  }

  if (setStatusEscort) {
    const { error: statusErr } = await supabase
      .from('tickets')
      .update({
        status: 'PROFESSIONAL_ESCORT',
        updated_at: new Date().toISOString(),
      })
      .eq('id', ticketId)
      .eq('client_id', clientId)
      .is('deleted_at', null)

    if (statusErr) {
      logger.warn('FORWARD_PRO', 'status update failed', { err: statusErr.message })
    }
  }

  const { error: logError } = await supabase.from('ticket_logs').insert({
    ticket_id: ticketId,
    action_type: 'FORWARDED_TO_PROFESSIONAL',
    notes: noteTrim || `הועבר ל${proName}`,
    created_by: 'system',
    meta: {
      professional_id: professionalId,
      professional_name: proName,
      phones,
      sms_sent: sms?.sent ?? 0,
      sms_total: sms?.total ?? phones.length,
      set_status_escort: setStatusEscort,
    },
  })

  if (logError) {
    logger.warn('FORWARD_PRO', 'ticket_logs insert failed', { err: logError.message })
  }

  return {
    ok: sms?.ok === true,
    sms,
    smsNote: sms?.ok ? undefined : smsNote,
  }
}
