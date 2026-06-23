import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveSmsTemplateMessage, resolveWhatsAppTemplateMessage } from '@/lib/whatsapp-templates'

import { getLogger } from '@/lib/logging'

import { sendResidentTextOrTemplate } from '@/lib/whatsapp-resident-outbound'

import { metaTemplateNameTicketClosed } from '@/lib/meta-whatsapp-pending-actions'

import { sendResidentSMS } from '@/lib/sms-send'

import { SMS_TEMPLATE_EDITOR_DEFAULTS } from '@/lib/whatsapp-template-keys'



export type ReporterClosedNotifyResult = {

  whatsappSent: boolean

  smsSent: boolean

  reporterHasPhone: boolean

  whatsappError?: string

  smsError?: string

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



async function tryResidentSmsFallback(

  supabaseAdmin: SupabaseClient,

  clientId: string,

  reporterPhone: string,

  projectName: string

): Promise<{ smsSent: boolean; smsError?: string }> {

  const { data: clientRow } = await supabaseAdmin

    .from('clients')

    .select('sms_on_ticket_close, sms_sender_name')

    .eq('id', clientId)

    .maybeSingle()



  const smsOnClose =

    (clientRow as { sms_on_ticket_close?: boolean | null } | null)?.sms_on_ticket_close !== false

  if (!smsOnClose) {

    return { smsSent: false, smsError: 'SMS on ticket close disabled for client' }

  }



  const smsSenderName = (clientRow as { sms_sender_name?: string | null } | null)?.sms_sender_name ?? null

  const smsBody = await resolveSmsTemplateMessage(

    supabaseAdmin,

    clientId,

    'sms_resident_ticket_closed',

    SMS_TEMPLATE_EDITOR_DEFAULTS.sms_resident_ticket_closed,

    { project_name: projectName }

  )



  const smsSent = await sendResidentSMS(reporterPhone, smsBody, smsSenderName, clientId)

  if (!smsSent) {

    return { smsSent: false, smsError: 'SMS send failed' }

  }

  return { smsSent: true }

}



/**

 * After a ticket is CLOSED: notify the reporter on WhatsApp (if configured).

 * Free text inside Meta's 24h window; Utility template outside it.

 * Falls back to SMS when WhatsApp cannot be delivered and sms_on_ticket_close is enabled.

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

  const result: ReporterClosedNotifyResult = {

    whatsappSent: false,

    smsSent: false,

    reporterHasPhone: Boolean(reporterPhone),

  }



  if (!reporterPhone) {

    return result

  }



  const building = opts.projectName?.trim() || 'הבניין'

  const logger = getLogger()



  const { data: waClient } = await supabaseAdmin

    .from('clients')

    .select('whatsapp_phone_number_id, whatsapp_access_token')

    .eq('id', clientId)

    .maybeSingle()



  const phoneNumberId = (waClient as { whatsapp_phone_number_id?: string | null } | null)?.whatsapp_phone_number_id

  const accessToken = (waClient as { whatsapp_access_token?: string | null } | null)?.whatsapp_access_token



  if (!phoneNumberId || !accessToken) {

    result.whatsappError = 'WhatsApp credentials missing for client'

  } else {

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

        logger.warn('WA_SEND', 'ticket_closed notify failed', {

          clientId,

          mode: send.mode,

          error: result.whatsappError,

          metaCode: send.metaErrorCode,

        })

      } else {

        logger.info('WA_SEND', 'ticket_closed notify sent', {

          clientId,

          mode: send.mode,

        })

      }

    } catch (e) {

      result.whatsappError = e instanceof Error ? e.message : String(e)

    }

  }



  if (!result.whatsappSent) {

    try {

      const sms = await tryResidentSmsFallback(supabaseAdmin, clientId, reporterPhone, building)

      result.smsSent = sms.smsSent

      if (sms.smsError) result.smsError = sms.smsError

      if (sms.smsSent) {

        logger.info('SMS_SEND', 'ticket_closed resident SMS fallback sent', { clientId })

      } else if (sms.smsError && sms.smsError !== 'SMS on ticket close disabled for client') {

        logger.warn('SMS_SEND', 'ticket_closed resident SMS fallback failed', {

          clientId,

          error: sms.smsError,

        })

      }

    } catch (e) {

      result.smsError = e instanceof Error ? e.message : String(e)

      logger.warn('SMS_SEND', 'ticket_closed resident SMS fallback failed', {

        clientId,

        error: result.smsError,

      })

    }

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

