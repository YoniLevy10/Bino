import { SupabaseClient } from '@supabase/supabase-js'
import { isWhatsAppTestSender, normalizeWhatsAppPhoneDigits } from '@/lib/whatsapp-test-phone'
import { isWhatsAppPlaceholderResident } from '@/lib/residents-whatsapp'

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

/** Project from an open pending join request — known building before manager name-approval. */
export async function findOpenPendingResidentProject(
  supabase: SupabaseClient,
  clientId: string,
  reporterWaFrom: string
): Promise<{ projectId: string } | null> {
  if (isWhatsAppTestSender(reporterWaFrom)) return null
  const digits = normalizeWhatsAppPhoneDigits(reporterWaFrom)
  if (!digits) return null

  const { data, error } = await supabase
    .from('pending_resident_join_requests')
    .select('project_id')
    .eq('client_id', clientId)
    .eq('reporter_phone_normalized', digits)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data?.project_id) return null
  return { projectId: data.project_id as string }
}

/** Returns true if a new pending row was created (not duplicate / error). */
export async function queuePendingResidentApproval(params: {
  supabase: SupabaseClient
  clientId: string
  projectId: string
  ticketId: string
  waFrom: string
}): Promise<boolean> {
  const { supabase, clientId, projectId, ticketId, waFrom } = params
  if (isWhatsAppTestSender(waFrom)) return false
  if (await reporterListedInProjectResidents(supabase, clientId, projectId, waFrom)) return false

  const digits = normalizeWhatsAppPhoneDigits(waFrom)
  if (!digits) return false

  const { error } = await supabase.from('pending_resident_join_requests').insert({
    client_id: clientId,
    project_id: projectId,
    ticket_id: ticketId,
    reporter_phone_normalized: digits,
    status: 'pending',
  })

  if (error?.code === '23505') {
    return false
  }
  if (error) {
    console.error('pending_resident_join_requests insert:', error)
    return false
  }
  return true
}
