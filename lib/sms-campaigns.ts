import type { SupabaseClient } from '@supabase/supabase-js'
import { send019StaffSms } from '@/lib/sms'
import { normalizePhone019 } from '@/lib/sms-019-core'
import { sanitizeSmsCampaignBody, validateSmsCampaignBody } from '@/lib/sms-campaign-message'

export type SmsCampaignRecipient = {
  resident_id: string
  full_name: string
  phone: string
  normalized_phone: string
}

export async function listSmsCampaignRecipients(
  admin: SupabaseClient,
  clientId: string,
  projectId: string
): Promise<{ recipients: SmsCampaignRecipient[]; skipped_no_phone: number }> {
  const { data, error } = await admin
    .from('residents')
    .select('id, full_name, phone, normalized_phone')
    .eq('client_id', clientId)
    .eq('project_id', projectId)
    .is('deleted_at', null)

  if (error) throw error

  const seen = new Set<string>()
  const recipients: SmsCampaignRecipient[] = []
  let skipped = 0

  for (const row of data ?? []) {
    const r = row as { id: string; full_name: string; phone: string | null; normalized_phone: string | null }
    const norm = r.normalized_phone || (r.phone ? normalizePhone019(r.phone) : null)
    if (!norm) {
      skipped++
      continue
    }
    if (seen.has(norm)) continue
    seen.add(norm)
    recipients.push({
      resident_id: r.id,
      full_name: r.full_name,
      phone: r.phone || norm,
      normalized_phone: norm,
    })
  }

  return { recipients, skipped_no_phone: skipped }
}

export type SmsCampaignRunResult = {
  recipients_total: number
  skipped_no_phone: number
  sent: number
  failed: number
  message_length: number
}

const MAX_PER_RUN = 500
const DELAY_MS = 400

export async function runSmsCampaign(
  admin: SupabaseClient,
  opts: {
    clientId: string
    projectId: string
    campaignName: string
    messageBody: string
    dryRun: boolean
    createdBy?: string | null
    senderName?: string | null
  }
): Promise<SmsCampaignRunResult> {
  const validationErr = validateSmsCampaignBody(opts.messageBody)
  if (validationErr) throw new Error(validationErr)

  const cleaned = sanitizeSmsCampaignBody(opts.messageBody)

  const { recipients, skipped_no_phone } = await listSmsCampaignRecipients(
    admin,
    opts.clientId,
    opts.projectId
  )

  const toSend = recipients.slice(0, MAX_PER_RUN)
  let sent = 0
  let failed = 0

  if (!opts.dryRun) {
    for (const r of toSend) {
      const ok = await send019StaffSms(r.normalized_phone, cleaned, opts.senderName ?? null, {
        channel: 'sms_campaign',
        clientId: opts.clientId,
      })
      if (ok) sent++
      else failed++
      if (DELAY_MS > 0) await new Promise((res) => setTimeout(res, DELAY_MS))
    }

    await admin.from('sms_campaign_runs').insert({
      client_id: opts.clientId,
      project_id: opts.projectId,
      campaign_name: opts.campaignName || 'קמפיין',
      message_body: cleaned,
      recipients_total: toSend.length,
      sent,
      failed,
      skipped_no_phone,
      dry_run: false,
      created_by: opts.createdBy ?? null,
    })
  }

  return {
    recipients_total: toSend.length,
    skipped_no_phone,
    sent,
    failed,
    message_length: cleaned.length,
  }
}
