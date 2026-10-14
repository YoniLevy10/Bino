import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveWhatsAppTemplateMessage } from '@/lib/whatsapp-templates'
import { getLogger } from '@/lib/logging'
import { sendResidentTextOrTemplate } from '@/lib/whatsapp-resident-outbound'
import {
  metaTemplateNameTicketStatusInProgress,
  metaTemplateNameTicketStatusWaitingParts,
} from '@/lib/meta-whatsapp-pending-actions'
import { ticketStatusLabelHe } from '@/lib/ticket-status'
import type { WhatsAppTemplateKey } from '@/lib/whatsapp-template-keys'

/** Statuses that may trigger a resident WhatsApp when the settings toggle is on. */
export const RESIDENT_STATUS_NOTIFY_WHITELIST = ['IN_PROGRESS', 'WAITING_PARTS'] as const
export type ResidentStatusNotifyStatus = (typeof RESIDENT_STATUS_NOTIFY_WHITELIST)[number]

export const RESIDENT_STATUS_NOTIFY_LOG_ACTION = 'RESIDENT_STATUS_NOTIFY'

export type ReporterStatusNotifyResult = {
  skipped: boolean
  reason?: string
  whatsappSent: boolean
  whatsappError?: string
  alreadySent?: boolean
}

function isWhitelistStatus(status: string): status is ResidentStatusNotifyStatus {
  return (RESIDENT_STATUS_NOTIFY_WHITELIST as readonly string[]).includes(status)
}

function resolveProjectName(
  projects: { name?: string | null } | { name?: string | null }[] | null | undefined
): string {
  const proj = projects
  const name = Array.isArray(proj) ? proj[0]?.name : proj?.name
  return name?.trim() || 'הבניין'
}

function templateKeyForStatus(status: ResidentStatusNotifyStatus): WhatsAppTemplateKey {
  return status === 'WAITING_PARTS' ? 'ticket_status_waiting_parts' : 'ticket_status_in_progress'
}

function metaTemplateForStatus(status: ResidentStatusNotifyStatus): string {
  return status === 'WAITING_PARTS'
    ? metaTemplateNameTicketStatusWaitingParts()
    : metaTemplateNameTicketStatusInProgress()
}

function fallbackBody(status: ResidentStatusNotifyStatus, projectName: string, ticketNumber: number): string {
  const statusHe = ticketStatusLabelHe(status)
  if (status === 'WAITING_PARTS') {
    return `שלום! תקלה #${ticketNumber} בבניין ${projectName} ממתינה לחלקים (${statusHe}). נעדכן כשיתאפשר להמשיך.`
  }
  return `שלום! תקלה #${ticketNumber} בבניין ${projectName} בטיפול (${statusHe}). נעדכן בהמשך.`
}

/**
 * Notify reporter on WhatsApp when ticket status enters IN_PROGRESS or WAITING_PARTS.
 * Requires clients.wa_notify_resident_on_status_change === true (default off).
 * Idempotent per ticket_id + status via ticket_logs RESIDENT_STATUS_NOTIFY.
 */
export async function notifyReporterOnStatusChange(
  supabaseAdmin: SupabaseClient,
  clientId: string,
  opts: {
    ticketId: string
    newStatus: string
    previousStatus: string | null | undefined
  }
): Promise<ReporterStatusNotifyResult> {
  const logger = getLogger()
  const newStatus = opts.newStatus.trim().toUpperCase()
  const previous = (opts.previousStatus || '').trim().toUpperCase()

  if (!isWhitelistStatus(newStatus)) {
    return { skipped: true, reason: 'status_not_whitelisted', whatsappSent: false }
  }
  if (previous === newStatus) {
    return { skipped: true, reason: 'status_unchanged', whatsappSent: false }
  }

  const { data: clientRow, error: clientErr } = await supabaseAdmin
    .from('clients')
    .select('wa_notify_resident_on_status_change, whatsapp_phone_number_id, whatsapp_access_token')
    .eq('id', clientId)
    .maybeSingle()

  if (clientErr || !clientRow) {
    return { skipped: true, reason: 'client_missing', whatsappSent: false }
  }

  if ((clientRow as { wa_notify_resident_on_status_change?: boolean }).wa_notify_resident_on_status_change !== true) {
    return { skipped: true, reason: 'setting_off', whatsappSent: false }
  }

  // Idempotency: already notified for this ticket+status?
  const { data: priorLog } = await supabaseAdmin
    .from('ticket_logs')
    .select('id')
    .eq('ticket_id', opts.ticketId)
    .eq('action_type', RESIDENT_STATUS_NOTIFY_LOG_ACTION)
    .eq('new_value', newStatus)
    .limit(1)
    .maybeSingle()

  if (priorLog) {
    return {
      skipped: true,
      reason: 'already_sent',
      whatsappSent: false,
      alreadySent: true,
    }
  }

  const { data: ticket, error: ticketErr } = await supabaseAdmin
    .from('tickets')
    .select('id, ticket_number, reporter_phone, status, projects(name)')
    .eq('id', opts.ticketId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .maybeSingle()

  if (ticketErr || !ticket) {
    return { skipped: true, reason: 'ticket_missing', whatsappSent: false }
  }

  const row = ticket as {
    ticket_number?: number | null
    reporter_phone?: string | null
    status?: string | null
    projects?: { name?: string | null } | { name?: string | null }[] | null
  }

  if ((row.status || '').toUpperCase() !== newStatus) {
    return { skipped: true, reason: 'status_race', whatsappSent: false }
  }

  const reporterPhone = row.reporter_phone?.trim()
  if (!reporterPhone) {
    return { skipped: true, reason: 'no_reporter_phone', whatsappSent: false }
  }

  const phoneNumberId = (clientRow as { whatsapp_phone_number_id?: string | null }).whatsapp_phone_number_id
  const accessToken = (clientRow as { whatsapp_access_token?: string | null }).whatsapp_access_token
  if (!phoneNumberId || !accessToken) {
    return {
      skipped: false,
      whatsappSent: false,
      whatsappError: 'WhatsApp credentials missing for client',
    }
  }

  const projectName = resolveProjectName(row.projects)
  const ticketNumber = typeof row.ticket_number === 'number' ? row.ticket_number : 0
  const statusHe = ticketStatusLabelHe(newStatus)
  const tplKey = templateKeyForStatus(newStatus)
  const fallback = fallbackBody(newStatus, projectName, ticketNumber)

  try {
    const waBody = await resolveWhatsAppTemplateMessage(
      supabaseAdmin,
      clientId,
      tplKey,
      fallback,
      {
        project_name: projectName,
        ticket_number: String(ticketNumber),
        description: statusHe,
      }
    )

    const send = await sendResidentTextOrTemplate(supabaseAdmin, {
      clientId,
      phone: reporterPhone,
      textBody: waBody,
      templateName: metaTemplateForStatus(newStatus),
      templateParams: [projectName, String(ticketNumber), statusHe],
      creds: { phoneNumberId, accessToken },
      failureLog: { clientId },
      persistOutbound: true,
      messageTypeForPersist: 'text',
    })

    if (!send.sent) {
      logger.warn('WA_SEND', 'resident_status_notify failed', {
        clientId,
        ticketId: opts.ticketId,
        status: newStatus,
        error: send.errorMessage,
        metaCode: send.metaErrorCode,
      })
      return {
        skipped: false,
        whatsappSent: false,
        whatsappError: send.errorMessage ?? 'WhatsApp send failed',
      }
    }

    await supabaseAdmin.from('ticket_logs').insert({
      ticket_id: opts.ticketId,
      action_type: RESIDENT_STATUS_NOTIFY_LOG_ACTION,
      old_value: previous || null,
      new_value: newStatus,
      performed_by: 'system',
      notes: 'נשלח לדייר',
    })

    logger.info('WA_SEND', 'resident_status_notify sent', {
      clientId,
      ticketId: opts.ticketId,
      status: newStatus,
      mode: send.mode,
    })

    return { skipped: false, whatsappSent: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.warn('WA_SEND', 'resident_status_notify threw', {
      clientId,
      ticketId: opts.ticketId,
      error: msg,
    })
    return { skipped: false, whatsappSent: false, whatsappError: msg }
  }
}
