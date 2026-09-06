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
  /** Present when send was queued for background processing */
  run_id?: string
  status?: 'queued' | 'running' | 'completed' | 'failed'
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
    /** When true and not dryRun: insert queued run and return immediately; caller schedules processSmsCampaignRun */
    queueAsync?: boolean
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

  if (opts.dryRun) {
    return {
      recipients_total: toSend.length,
      skipped_no_phone,
      sent: 0,
      failed: 0,
      message_length: cleaned.length,
      status: 'completed',
    }
  }

  if (opts.queueAsync) {
    const { data: runRow, error: insertErr } = await admin
      .from('sms_campaign_runs')
      .insert({
        client_id: opts.clientId,
        project_id: opts.projectId,
        campaign_name: opts.campaignName || 'קמפיין',
        message_body: cleaned,
        recipients_total: toSend.length,
        sent: 0,
        failed: 0,
        skipped_no_phone,
        dry_run: false,
        created_by: opts.createdBy ?? null,
        status: 'queued',
      })
      .select('id')
      .single()

    if (insertErr || !runRow) {
      throw new Error(insertErr?.message || 'יצירת רצת קמפיין נכשלה')
    }

    return {
      recipients_total: toSend.length,
      skipped_no_phone,
      sent: 0,
      failed: 0,
      message_length: cleaned.length,
      run_id: (runRow as { id: string }).id,
      status: 'queued',
    }
  }

  let sent = 0
  let failed = 0
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
    status: 'completed',
    finished_at: new Date().toISOString(),
  })

  return {
    recipients_total: toSend.length,
    skipped_no_phone,
    sent,
    failed,
    message_length: cleaned.length,
    status: 'completed',
  }
}

/** Background worker for a queued SMS campaign run. */
export async function processSmsCampaignRun(
  admin: SupabaseClient,
  opts: {
    runId: string
    clientId: string
    senderName?: string | null
  }
): Promise<void> {
  const { data: run, error } = await admin
    .from('sms_campaign_runs')
    .select('id, client_id, project_id, message_body, status, recipients_total')
    .eq('id', opts.runId)
    .eq('client_id', opts.clientId)
    .maybeSingle()

  if (error || !run) throw new Error(error?.message || 'רצת קמפיין לא נמצאה')
  const row = run as {
    id: string
    client_id: string
    project_id: string
    message_body: string
    status?: string
  }
  if (row.status === 'completed' || row.status === 'failed') return

  await admin
    .from('sms_campaign_runs')
    .update({ status: 'running' })
    .eq('id', opts.runId)

  try {
    const cleaned = sanitizeSmsCampaignBody(row.message_body)
    const { recipients } = await listSmsCampaignRecipients(admin, row.client_id, row.project_id)
    const toSend = recipients.slice(0, MAX_PER_RUN)
    let sent = 0
    let failed = 0

    for (const r of toSend) {
      const ok = await send019StaffSms(r.normalized_phone, cleaned, opts.senderName ?? null, {
        channel: 'sms_campaign',
        clientId: row.client_id,
      })
      if (ok) sent++
      else failed++
      // Persist progress periodically so the UI can poll.
      if ((sent + failed) % 5 === 0 || sent + failed === toSend.length) {
        await admin
          .from('sms_campaign_runs')
          .update({ sent, failed, recipients_total: toSend.length })
          .eq('id', opts.runId)
      }
      if (DELAY_MS > 0) await new Promise((res) => setTimeout(res, DELAY_MS))
    }

    await admin
      .from('sms_campaign_runs')
      .update({
        sent,
        failed,
        recipients_total: toSend.length,
        status: 'completed',
        finished_at: new Date().toISOString(),
      })
      .eq('id', opts.runId)
  } catch (e) {
    await admin
      .from('sms_campaign_runs')
      .update({
        status: 'failed',
        error_message: e instanceof Error ? e.message : String(e),
        finished_at: new Date().toISOString(),
      })
      .eq('id', opts.runId)
    throw e
  }
}
