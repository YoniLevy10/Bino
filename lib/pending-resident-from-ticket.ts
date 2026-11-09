import { SupabaseClient } from '@supabase/supabase-js'
import { isWhatsAppTestSender, normalizeWhatsAppPhoneDigits } from '@/lib/whatsapp-test-phone'
import { isWhatsAppPlaceholderResident } from '@/lib/residents-whatsapp'
import { sanitizeWhatsAppProfileName } from '@/lib/whatsapp-profile-name'

function stripLeadingCountry(d: string): string {
  let x = d
  if (x.startsWith('972')) x = x.slice(3)
  if (x.startsWith('0')) x = x.slice(1)
  return x
}

export function phonesLikelySameResident(a: string, b: string): boolean {
  const da = normalizeWhatsAppPhoneDigits(a)
  const db = normalizeWhatsAppPhoneDigits(b)
  if (!da || !db) return false
  if (da === db) return true
  const ta = stripLeadingCountry(da)
  const tb = stripLeadingCountry(db)
  if (ta && tb && ta === tb) return true
  const min = Math.min(ta.length, tb.length)
  if (min >= 8) {
    return ta.slice(-min) === tb.slice(-min)
  }
  return false
}

export async function reporterListedInProjectResidents(
  supabase: SupabaseClient,
  clientId: string,
  projectId: string,
  reporterWaFrom: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('residents')
    .select('phone, full_name')
    .eq('project_id', projectId)
    .eq('client_id', clientId)
    .is('deleted_at', null)

  if (error || !data?.length) return false
  return data.some((r) => {
    const row = r as { phone?: string | null; full_name?: string | null }
    if (isWhatsAppPlaceholderResident(row)) return false
    return phonesLikelySameResident(String(row.phone || ''), reporterWaFrom)
  })
}

function missingSuggestedNameColumn(err: { code?: string; message?: string; details?: string } | null): boolean {
  if (!err) return false
  const text = `${err.message || ''} ${err.details || ''}`.toLowerCase()
  return text.includes('suggested_name') && (text.includes('does not exist') || text.includes('schema cache') || err.code === '42703' || err.code === 'PGRST204')
}

/** Returns true if a new pending row was created (not duplicate / error). */
export async function queuePendingResidentApproval(params: {
  supabase: SupabaseClient
  clientId: string
  projectId: string
  ticketId: string
  waFrom: string
  /** WhatsApp profile name. Stored as a suggestion; the manager confirms before it is saved. */
  suggestedName?: string | null
}): Promise<boolean> {
  const { supabase, clientId, projectId, ticketId, waFrom } = params
  const suggestedName = sanitizeWhatsAppProfileName(params.suggestedName)
  if (isWhatsAppTestSender(waFrom)) return false
  if (await reporterListedInProjectResidents(supabase, clientId, projectId, waFrom)) return false

  const digits = normalizeWhatsAppPhoneDigits(waFrom)
  if (!digits) return false

  const row = {
    client_id: clientId,
    project_id: projectId,
    ticket_id: ticketId,
    reporter_phone_normalized: digits,
    status: 'pending' as const,
  }

  let { error } = await supabase.from('pending_resident_join_requests').insert(
    suggestedName ? { ...row, suggested_name: suggestedName } : row
  )

  if (error && suggestedName && missingSuggestedNameColumn(error)) {
    ;({ error } = await supabase.from('pending_resident_join_requests').insert(row))
  }

  if (error?.code === '23505') {
    if (suggestedName) {
      await supabase
        .from('pending_resident_join_requests')
        .update({ suggested_name: suggestedName })
        .eq('client_id', clientId)
        .eq('project_id', projectId)
        .eq('reporter_phone_normalized', digits)
        .eq('status', 'pending')
        .is('suggested_name', null)
    }
    return false
  }
  if (error) {
    console.error('pending_resident_join_requests insert:', error)
    return false
  }
  return true
}
