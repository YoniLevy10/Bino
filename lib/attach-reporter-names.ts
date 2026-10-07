import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeReporterPhone, savedResidentDisplayName } from '@/lib/reporter-display'

type ResidentNameRow = {
  full_name: string
  normalized_phone: string | null
  project_id: string | null
}

export type ReporterNameTicket = {
  reporter_phone?: string | null
  reporter_name?: string | null
  project_id?: string | null
}

/**
 * Fill `reporter_name` from `residents` when the ticket only stored a phone
 * and that phone belongs to a named resident.
 */
export async function attachSavedResidentNames<T extends ReporterNameTicket>(
  supabase: SupabaseClient,
  clientId: string,
  tickets: T[]
): Promise<T[]> {
  const missing = tickets.filter(
    (ticket) => !savedResidentDisplayName(ticket.reporter_name) && (ticket.reporter_phone ?? '').trim()
  )
  if (missing.length === 0) return tickets

  const phones = [
    ...new Set(
      missing
        .map((ticket) => normalizeReporterPhone(ticket.reporter_phone || ''))
        .filter((phone) => phone.length > 0)
    ),
  ]
  if (phones.length === 0) return tickets

  const { data, error } = await supabase
    .from('residents')
    .select('full_name, normalized_phone, project_id')
    .eq('client_id', clientId)
    .in('normalized_phone', phones)
    .is('deleted_at', null)

  if (error || !data?.length) return tickets

  const rows = data as ResidentNameRow[]

  return tickets.map((ticket) => {
    if (savedResidentDisplayName(ticket.reporter_name)) return ticket
    const phone = (ticket.reporter_phone ?? '').trim()
    if (!phone) return ticket
    const key = normalizeReporterPhone(phone)
    const matches = rows.filter(
      (row) => row.normalized_phone === key && savedResidentDisplayName(row.full_name)
    )
    const picked =
      matches.find((row) => ticket.project_id && row.project_id === ticket.project_id) || matches[0]
    if (!picked) return ticket
    return { ...ticket, reporter_name: picked.full_name }
  })
}
