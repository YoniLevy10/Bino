import type { SupabaseClient } from '@supabase/supabase-js'
import { resolvePilotSmsMessage } from '@/lib/pilot-announcement-message'
import { normalizePhone } from '@/lib/residents-whatsapp'
import { send019StaffSms } from '@/lib/sms'

const SMS_DELAY_MS = 400
const MAX_RECIPIENTS_PER_RUN = 500

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

function maskPhone(phone: string): string {
  if (phone.length < 6) return '***'
  return `${phone.slice(0, 5)}***${phone.slice(-2)}`
}

export type PilotSmsRecipient = {
  resident_id: string
  full_name: string
  phone: string
}

export type PilotSmsRunResult = {
  message: string
  messageLength: number
  recipientsTotal: number
  skippedNoPhone: number
  sent: number
  failed: number
  failures: { resident_id: string; full_name: string; phone: string; error: string }[]
}

export async function listPilotSmsRecipients(
  admin: SupabaseClient,
  clientId: string,
  projectId: string
): Promise<{ recipients: PilotSmsRecipient[]; skippedNoPhone: number }> {
  const { data: project, error: projErr } = await admin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('client_id', clientId)
    .maybeSingle()
  if (projErr || !project) throw new Error('פרויקט לא נמצא')

  const { data: rows, error } = await admin
    .from('residents')
    .select('id, full_name, phone, normalized_phone')
    .eq('client_id', clientId)
    .eq('project_id', projectId)
    .is('deleted_at', null)

  if (error) throw new Error(error.message)

  const seen = new Set<string>()
  const recipients: PilotSmsRecipient[] = []
  let skippedNoPhone = 0

  for (const row of rows ?? []) {
    const r = row as {
      id: string
      full_name: string
      phone: string | null
      normalized_phone: string | null
    }
    const raw = (r.normalized_phone || r.phone || '').trim()
    if (!raw) {
      skippedNoPhone++
      continue
    }
    const normalized = normalizePhone(raw)
    if (!normalized || normalized.length < 11) {
      skippedNoPhone++
      continue
    }
    if (seen.has(normalized)) continue
    seen.add(normalized)
    recipients.push({
      resident_id: r.id,
      full_name: r.full_name,
      phone: normalized,
    })
  }

  return { recipients, skippedNoPhone }
}

export async function runProjectPilotSms(params: {
  admin: SupabaseClient
  clientId: string
  projectId: string
  smsSenderName: string | null
  dryRun?: boolean
  message?: string | null
}): Promise<PilotSmsRunResult> {
  const message = resolvePilotSmsMessage(params.message)
  const { recipients, skippedNoPhone } = await listPilotSmsRecipients(
    params.admin,
    params.clientId,
    params.projectId
  )

  if (recipients.length > MAX_RECIPIENTS_PER_RUN) {
    throw new Error(`יותר מדי נמענים (${recipients.length}). מקסימום ${MAX_RECIPIENTS_PER_RUN} לשליחה אחת.`)
  }

  const base: PilotSmsRunResult = {
    message,
    messageLength: message.length,
    recipientsTotal: recipients.length,
    skippedNoPhone,
    sent: 0,
    failed: 0,
    failures: [],
  }

  if (params.dryRun) return base

  for (let i = 0; i < recipients.length; i++) {
    const r = recipients[i]
    const ok = await send019StaffSms(r.phone, message, params.smsSenderName, {
      channel: 'pilot_announcement',
      clientId: params.clientId,
    })
    if (ok) base.sent++
    else {
      base.failed++
      base.failures.push({
        resident_id: r.resident_id,
        full_name: r.full_name,
        phone: maskPhone(r.phone),
        error: 'שליחה נכשלה',
      })
    }
    if (i < recipients.length - 1) await sleep(SMS_DELAY_MS)
  }

  return base
}
