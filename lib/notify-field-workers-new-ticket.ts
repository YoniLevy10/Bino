import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWorkerSMSAll } from '@/lib/sms-send'
import { collectWorkerPhones } from '@/lib/worker-phones'
import { getWorkerPortalUrl, getPublicTicketsUrl } from '@/lib/public-app-url'
import { SMS_TEMPLATE_EDITOR_DEFAULTS } from '@/lib/whatsapp-template-keys'
import { resolveSmsTemplateMessage } from '@/lib/whatsapp-templates'

/** Notify field workers flagged with receives_new_ticket_alerts (deduped phones). */
export async function notifyAlertWorkersOnNewTicket(
  admin: SupabaseClient,
  clientId: string,
  params: {
    project_name: string
    ticket_number: number
    description: string
    reporter_name: string
    sms_sender_name: string | null
    client_name: string
  }
): Promise<void> {
  const { data: workers, error } = await admin
    .from('workers')
    .select('id, phone, extra_phones, access_token')
    .eq('client_id', clientId)
    .eq('receives_new_ticket_alerts', true)
    .eq('is_active', true)
    .is('deleted_at', null)

  if (error || !workers?.length) return

  const msg = await resolveSmsTemplateMessage(
    admin,
    clientId,
    'sms_worker_new_ticket',
    SMS_TEMPLATE_EDITOR_DEFAULTS.sms_worker_new_ticket,
    {
      project_name: params.project_name,
      ticket_number: String(params.ticket_number),
      description: params.description || 'ללא פירוט',
      reporter_name: params.reporter_name,
      dashboard_url: getPublicTicketsUrl(),
      client_name: params.client_name,
    }
  )

  const seen = new Set<string>()
  for (const w of workers) {
    const phones = collectWorkerPhones(w as { phone?: string | null; extra_phones?: string[] | null })
    const token = (w as { access_token?: string | null }).access_token?.trim()
    const url = token ? getWorkerPortalUrl(token) : getPublicTicketsUrl()
    const personalized = msg.replace(getPublicTicketsUrl(), url)
    const batch = phones.filter((p) => {
      if (seen.has(p)) return false
      seen.add(p)
      return true
    })
    if (batch.length) {
      await sendWorkerSMSAll(batch, personalized, params.sms_sender_name, clientId)
    }
  }
}
