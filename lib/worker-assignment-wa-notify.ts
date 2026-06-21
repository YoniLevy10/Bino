import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWhatsAppTemplateMessageWithCredentials } from '@/lib/whatsapp-send'
import { normalizePhone } from '@/lib/residents-whatsapp'
import { metaTemplateNameWorkerAssignment } from '@/lib/meta-whatsapp-pending-actions'
import { getLogger } from '@/lib/logging'

export type WorkerAssignmentWaResult = {
  sent: number
  failed: number
}

/**
 * Notify assigned worker via Meta-approved template (works outside 24h session window).
 * SMS remains the primary channel; this is additive.
 */
export async function notifyWorkerAssignmentWhatsApp(
  supabase: SupabaseClient,
  params: {
    clientId: string
    workerPhones: string[]
    buildingName: string
    ticketNumber: number
    description: string | null
  }
): Promise<WorkerAssignmentWaResult> {
  const result = { sent: 0, failed: 0 }
  if (params.workerPhones.length === 0) return result

  const { data: clientRow } = await supabase
    .from('clients')
    .select('whatsapp_phone_number_id, whatsapp_access_token')
    .eq('id', params.clientId)
    .maybeSingle()

  const phoneNumberId = (clientRow as { whatsapp_phone_number_id?: string | null } | null)?.whatsapp_phone_number_id
  const accessToken = (clientRow as { whatsapp_access_token?: string | null } | null)?.whatsapp_access_token
  if (!phoneNumberId || !accessToken) return result

  const creds = { phoneNumberId, accessToken }
  const templateParams = [
    params.buildingName.slice(0, 60),
    String(params.ticketNumber),
    (params.description || 'ללא תיאור').slice(0, 200),
  ]
  const templateName = metaTemplateNameWorkerAssignment()
  const failureLog = { clientId: params.clientId }
  const logger = getLogger()

  for (const raw of params.workerPhones) {
    const to = normalizePhone(raw.trim())
    if (!to) {
      result.failed++
      continue
    }
    try {
      const wa = await sendWhatsAppTemplateMessageWithCredentials(
        to,
        templateName,
        templateParams,
        creds,
        'he',
        failureLog
      )
      if (wa) {
        result.sent++
      } else {
        result.failed++
      }
    } catch (e) {
      result.failed++
      logger.warn('ASSIGN', 'Worker WA template failed', {
        err: e instanceof Error ? e.message : String(e),
        to: `…${to.slice(-4)}`,
      })
    }
  }

  return result
}
