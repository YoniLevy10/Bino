import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone019 } from '@/lib/sms-019-core'
import { sendRawWhatsAppPayloadWithCredentials } from '@/lib/whatsapp-send'

export async function runWhatsAppBroadcast(
  admin: SupabaseClient,
  opts: {
    clientId: string
    projectId: string
    templateName: string
    templateLanguage?: string
    bodyParam?: string
    dryRun: boolean
  }
): Promise<{ recipients_total: number; sent: number; failed: number }> {
  const { data: residents, error } = await admin
    .from('residents')
    .select('phone, normalized_phone')
    .eq('client_id', opts.clientId)
    .eq('project_id', opts.projectId)
    .is('deleted_at', null)

  if (error) throw error

  const phones = new Set<string>()
  for (const r of residents ?? []) {
    const row = r as { phone?: string | null; normalized_phone?: string | null }
    const p = row.normalized_phone || (row.phone ? normalizePhone019(row.phone) : null)
    if (p) phones.add(p)
  }

  const list = [...phones].slice(0, 200)
  if (opts.dryRun) {
    return { recipients_total: list.length, sent: 0, failed: 0 }
  }

  const { data: clientRow } = await admin
    .from('clients')
    .select('whatsapp_phone_number_id, whatsapp_access_token')
    .eq('id', opts.clientId)
    .maybeSingle()

  const phoneNumberId = (clientRow as { whatsapp_phone_number_id?: string } | null)?.whatsapp_phone_number_id
  const accessToken = (clientRow as { whatsapp_access_token?: string } | null)?.whatsapp_access_token

  if (!phoneNumberId || !accessToken) {
    throw new Error('WhatsApp לא מוגדר ללקוח')
  }

  let sent = 0
  let failed = 0
  const params = opts.bodyParam ? [opts.bodyParam] : []

  for (const phone of list) {
    const components =
      params.length > 0
        ? [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text })) }]
        : []

    const result = await sendRawWhatsAppPayloadWithCredentials(phoneNumberId, accessToken, {
      to: phone,
      type: 'template',
      template: {
        name: opts.templateName,
        language: { code: opts.templateLanguage || 'he' },
        components,
      },
    })
    if (result) sent++
    else failed++
    await new Promise((r) => setTimeout(r, 300))
  }

  await admin.from('wa_broadcast_runs').insert({
    client_id: opts.clientId,
    project_id: opts.projectId,
    template_name: opts.templateName,
    template_language: opts.templateLanguage || 'he',
    recipients_total: list.length,
    sent,
    failed,
    dry_run: false,
  })

  return { recipients_total: list.length, sent, failed }
}

export const WHATSAPP_COEXISTENCE_NOTE =
  'Coexistence: Meta Tech Provider or BSP (360dialog/Chakra) required for syncing WhatsApp Business App with Cloud API.'
