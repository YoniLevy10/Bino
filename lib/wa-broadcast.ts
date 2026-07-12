import type { SupabaseClient } from '@supabase/supabase-js'
import { insertWhatsAppSendFailure } from '@/lib/error-logs-db'
import { sendRawWhatsAppPayloadWithCredentials, type WhatsAppMetaError } from '@/lib/whatsapp-send'
import { formatWhatsAppTemplateFailureMessage } from '@/lib/whatsapp-meta-errors'
import { buildInboxTemplatePreview } from '@/lib/whatsapp-inbox-meta-templates'
import {
  extractMetaWaMessageId,
  persistWhatsAppMessage,
} from '@/lib/whatsapp-message-store'
import {
  listWaBroadcastRecipients,
  WA_BROADCAST_MAX_PER_RUN,
  type WaBroadcastRecipientBreakdown,
} from '@/lib/wa-broadcast-eligibility'
import {
  resolveWaBroadcastTemplate,
  resolveWaBroadcastTemplateByMetaName,
} from '@/lib/wa-broadcast-policy'

export type WaBroadcastRunResult = WaBroadcastRecipientBreakdown & {
  recipients_total: number
  sent: number
  failed: number
  template_name: string
  dry_run: boolean
}

function resolveTemplate(opts: {
  templateId?: string
  templateName?: string
}) {
  if (opts.templateId?.trim()) {
    return resolveWaBroadcastTemplate(opts.templateId.trim())
  }
  if (opts.templateName?.trim()) {
    return resolveWaBroadcastTemplateByMetaName(opts.templateName.trim())
  }
  return undefined
}

export async function runWhatsAppBroadcast(
  admin: SupabaseClient,
  opts: {
    clientId: string
    projectId: string
    templateId?: string
    templateName?: string
    templateLanguage?: string
    bodyParams?: string[]
    bodyParam?: string
    dryRun: boolean
  }
): Promise<WaBroadcastRunResult> {
  const catalog = resolveTemplate({
    templateId: opts.templateId,
    templateName: opts.templateName,
  })

  if (!catalog) {
    throw new Error(
      'תבנית לא מורשית לתפוצה. השתמשו רק בתבנית Utility מאושרת (ticket_closed).'
    )
  }

  const metaName = catalog.resolveMetaName()
  const lang = opts.templateLanguage || catalog.language

  const expectedParams = catalog.params.length
  let params = opts.bodyParams ?? (opts.bodyParam ? [opts.bodyParam] : [])
  if (params.length !== expectedParams) {
    if (expectedParams === 0) params = []
    else if (expectedParams === 1 && opts.bodyParam && !opts.bodyParams?.length) {
      params = [opts.bodyParam]
    } else {
      throw new Error(`נדרשים ${expectedParams} פרמטרים לתבנית "${catalog.label}"`)
    }
  }

  const trimmedParams = params.map((p) => p.trim())
  for (let i = 0; i < catalog.params.length; i++) {
    if (!trimmedParams[i]) {
      throw new Error(`שדה חובה: ${catalog.params[i].label}`)
    }
  }

  const breakdown = await listWaBroadcastRecipients(admin, opts.clientId, opts.projectId)
  const list = breakdown.recipients.slice(0, WA_BROADCAST_MAX_PER_RUN)

  if (!opts.dryRun && list.length === 0) {
    throw new Error(
      'אין נמענים זכאים — אף דייר בבניין לא יצר קשר קודם ב-WhatsApp. SMS מתאים לפנייה ראשונה.'
    )
  }

  if (opts.dryRun) {
    return {
      ...breakdown,
      recipients_total: list.length,
      sent: 0,
      failed: 0,
      template_name: metaName,
      dry_run: true,
    }
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
  const previewBody = buildInboxTemplatePreview(catalog, trimmedParams)

  const components =
    trimmedParams.length > 0
      ? [{ type: 'body', parameters: trimmedParams.map((text) => ({ type: 'text', text })) }]
      : []

  for (const recipient of list) {
    const metaErr: { current?: WhatsAppMetaError } = {}
    const result = await sendRawWhatsAppPayloadWithCredentials(phoneNumberId, accessToken, {
      to: recipient.normalized_phone,
      type: 'template',
      template: {
        name: metaName,
        language: { code: lang },
        components,
      },
    }, metaErr)
    if (result) {
      sent++
      await persistWhatsAppMessage(admin, {
        clientId: opts.clientId,
        phone: recipient.normalized_phone,
        direction: 'out',
        body: `[תבנית: ${catalog.label}] ${previewBody}`,
        messageType: 'template',
        waMessageId: extractMetaWaMessageId(result),
        residentId: recipient.resident_id,
      })
    } else {
      failed++
      const failureMessage =
        formatWhatsAppTemplateFailureMessage(metaName, metaErr.current) ||
        `Broadcast template "${metaName}" failed`
      await insertWhatsAppSendFailure(
        opts.clientId,
        recipient.normalized_phone,
        metaName,
        failureMessage,
        {
          send_kind: 'template',
          template_name: metaName,
          template_params: trimmedParams,
          template_language: lang,
          preview_body: previewBody,
          meta_http_status: metaErr.current?.httpStatus,
          meta_error_code: metaErr.current?.metaCode,
          meta_error_message: metaErr.current?.message,
        }
      )
    }
    await new Promise((r) => setTimeout(r, 300))
  }

  await admin.from('wa_broadcast_runs').insert({
    client_id: opts.clientId,
    project_id: opts.projectId,
    template_name: metaName,
    template_language: lang,
    recipients_total: list.length,
    sent,
    failed,
    dry_run: false,
  })

  return {
    ...breakdown,
    recipients_total: list.length,
    sent,
    failed,
    template_name: metaName,
    dry_run: false,
  }
}

export const WHATSAPP_COEXISTENCE_NOTE =
  'Coexistence: Meta Tech Provider or BSP (360dialog/Chakra) required for syncing WhatsApp Business App with Cloud API.'
