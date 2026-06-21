import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePhone019 } from '@/lib/sms-019-core'
import { normalizePhone } from '@/lib/residents-whatsapp'

export type WaBroadcastRecipient = {
  resident_id: string
  full_name: string
  phone: string
  normalized_phone: string
}

export type WaBroadcastRecipientBreakdown = {
  recipients: WaBroadcastRecipient[]
  residents_with_phone: number
  skipped_no_phone: number
  /** דיירים ברשימה אך מעולם לא יצרו קשר ב-WhatsApp עם המערכת */
  skipped_never_whatsapp: number
}

/**
 * Phones with prior WhatsApp relationship (inbound message or ticket opened via WA).
 */
export async function loadWhatsAppContactedPhones(
  admin: SupabaseClient,
  clientId: string
): Promise<Set<string>> {
  const phones = new Set<string>()

  const { data: convs } = await admin
    .from('whatsapp_conversations')
    .select('phone')
    .eq('client_id', clientId)

  for (const row of convs ?? []) {
    const p = normalizePhone(String((row as { phone?: string }).phone || ''))
    if (p && !p.startsWith('wa_test_')) phones.add(p)
  }

  const { data: tickets } = await admin
    .from('tickets')
    .select('reporter_phone')
    .eq('client_id', clientId)
    .eq('source', 'whatsapp')
    .is('deleted_at', null)
    .not('reporter_phone', 'is', null)

  for (const row of tickets ?? []) {
    const raw = (row as { reporter_phone?: string | null }).reporter_phone
    if (!raw) continue
    const p = normalizePhone(raw.trim())
    if (p && !p.startsWith('wa_test_')) phones.add(p)
  }

  return phones
}

export async function listWaBroadcastRecipients(
  admin: SupabaseClient,
  clientId: string,
  projectId: string
): Promise<WaBroadcastRecipientBreakdown> {
  const contacted = await loadWhatsAppContactedPhones(admin, clientId)

  const { data, error } = await admin
    .from('residents')
    .select('id, full_name, phone, normalized_phone')
    .eq('client_id', clientId)
    .eq('project_id', projectId)
    .is('deleted_at', null)

  if (error) throw error

  const seen = new Set<string>()
  const recipients: WaBroadcastRecipient[] = []
  let skipped_no_phone = 0
  let skipped_never_whatsapp = 0
  let residents_with_phone = 0

  for (const row of data ?? []) {
    const r = row as {
      id: string
      full_name: string
      phone: string | null
      normalized_phone: string | null
    }
    const norm =
      r.normalized_phone ||
      (r.phone ? normalizePhone019(r.phone) : null) ||
      (r.phone ? normalizePhone(r.phone) : null)

    if (!norm) {
      skipped_no_phone++
      continue
    }

    residents_with_phone++

    if (!contacted.has(norm)) {
      skipped_never_whatsapp++
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

  return {
    recipients,
    residents_with_phone,
    skipped_no_phone,
    skipped_never_whatsapp,
  }
}

export const WA_BROADCAST_POLICY_NOTE =
  'WhatsApp ≠ SMS: Meta מאפשרת תבניות Utility לדיירים שכבר יצרו קשר (הודעה נכנסת או תקלה מ-WhatsApp). ' +
  'דיירים ברשימה שמעולם לא כתבו — לא יקבלו הודעה. תבניות Marketing דורשות opt-in מפורש — לא נתמך כרגע.'

export const WA_BROADCAST_MAX_PER_RUN = 200
