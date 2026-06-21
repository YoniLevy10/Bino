import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveWhatsAppTemplateMessage } from '@/lib/whatsapp-templates'
import { getLogger } from '@/lib/logging'
import { sendResidentTextOrTemplate } from '@/lib/whatsapp-resident-outbound'
import { metaTemplateNameTicketClosed } from '@/lib/meta-whatsapp-pending-actions'

export type ReporterClosedNotifyResult = {
  whatsappSent: boolean
  reporterHasPhone: boolean
  whatsappError?: string
}

const TICKET_CLOSED_WA_FALLBACK =
  'שלום! התקלה שדיווחת בבניין {{project_name}} טופלה וסגורה.\n\nאם יש בעיה נוספת, ניתן לפנות אלינו בכל עת.'

function resolveProjectName(
  projects: { name?: string | null } | { name?: string | null }[] | null | undefined
): string {
  const proj = projects
  const name = Array.isArray(proj) ? proj[0]?.name : proj?.name
  return name?.trim() || 'הבניין'
}

/**
 * After a ticket is CLOSED: notify the reporter on WhatsApp (if configured).
 * Free text inside Meta's 24h window; Utility template outside it.
 * Non-throwing — failures are returned in the result for logging.
 */
export async function notifyReporterTicketClosed(
  supabaseAdmin: SupabaseClient,
  clientId: string,
  opts: {
    reporterPhone: string | null | undefined
    projectName: string
  }
): Promise<ReporterClosedNotifyResult> {
  const reporterPhone = opts.reporterPhone?.trim()
  const result: ReporterClosedNotifyResult = { whatsappSent: false, reporterHasPhone: Boolean(reporterPhone) }

  if (!reporterPhone) {
    return result
  }

  const building = opts.projectName?.trim() || 'הבניין'

  const { data: waClient } = await supabaseAdmin
    .from('clients')
    .select('whatsapp_phone_number_id, whatsapp_access_token')
    .eq('id', clientId)
    .maybeSingle()

  const phoneNumberId = (waClient as { whatsapp_phone_number_id?: string | null } | null)?.whatsapp_phone_number_id
  const accessToken = (waClient as { whatsapp_access_token?: string | null } | null)?.whatsapp_access_token

  if (!phoneNumberId || !accessToken) {
    result.whatsappError = 'WhatsApp credentials missing for client'
    return result
  }

  try {
    const waBody = await resolveWhatsAppTemplateMessage(
      supabaseAdmin,
      clientId,
      'ticket_closed',
      TICKET_CLOSED_WA_FALLBACK,
      { project_name: building }
    )

    const send = await sendResidentTextOrTemplate(supabaseAdmin, {
      clientId,
      phone: reporterPhone,
      textBody: waBody,
      templateName: metaTemplateNameTicketClosed(),
      templateParams: [building],
      creds: { phoneNumberId, accessToken },
      failureLog: { clientId },
      persistOutbound: true,
      messageTypeForPersist: 'text',
    })

    result.whatsappSent = send.sent
    if (!send.sent) {
      result.whatsappError = send.errorMessage ?? 'WhatsApp send failed (text and template)'
      getLogger().warn('WA_SEND', 'ticket_closed notify failed', {
        clientId,
        mode: send.mode,
        error: result.whatsappError,
        metaCode: send.metaErrorCode,
      })
    } else {
      getLogger().info('WA_SEND', 'ticket_closed notify sent', {
        clientId,
        mode: send.mode,
      })
    }
  } catch (e) {
    result.whatsappError = e instanceof Error ? e.message : String(e)
  }

  return result
}

/**
 * Notify reporter when status transitions to CLOSED (idempotent if already closed).
 */
export async function notifyReporterIfTicketNewlyClosed(
  supabaseAdmin: SupabaseClient,
  clientId: string,
  ticketId: string,
  previousStatus: string | null | undefined
): Promise<ReporterClosedNotifyResult | null> {
  if (previousStatus === 'CLOSED') return null

  const { data: ticket, error } = await supabaseAdmin
    .from('tickets')
    .select('status, reporter_phone, projects(name)')
    .eq('id', ticketId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !ticket || (ticket as { status?: string }).status !== 'CLOSED') {
    return null
  }

  const row = ticket as {
    reporter_phone?: string | null
    projects?: { name?: string | null } | { name?: string | null }[] | null
  }

  return notifyReporterTicketClosed(supabaseAdmin, clientId, {
    reporterPhone: row.reporter_phone,
    projectName: resolveProjectName(row.projects),
  })
}
