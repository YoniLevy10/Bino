import type { SupabaseClient } from '@supabase/supabase-js'
import { isTicketInTreatment } from '@/lib/ticket-status'
import { statusLabelHe } from '@/lib/whatsapp-intent'

export type TicketStatusRow = {
  ticket_number: number
  status: string
  workers: { full_name: string | null } | { full_name: string | null }[] | null
}

function workerName(workers: TicketStatusRow['workers']): string | null {
  if (!workers) return null
  if (Array.isArray(workers)) return workers[0]?.full_name ?? null
  return workers.full_name
}

/** Build Hebrew status lines for open tickets from this reporter. */
export async function fetchOpenTicketStatusLines(
  admin: SupabaseClient,
  clientId: string,
  fromPhone: string
): Promise<string[]> {
  const { data: rows } = await admin
    .from('tickets')
    .select('ticket_number, status, workers ( full_name )')
    .eq('reporter_phone', fromPhone)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .neq('status', 'CLOSED')
    .order('created_at', { ascending: false })
    .limit(5)

  if (!rows?.length) return []

  return (rows as TicketStatusRow[]).map((row) => {
    const name = workerName(row.workers)
    let s = `תקלה #${row.ticket_number}: ${statusLabelHe(row.status)}.`
    if (isTicketInTreatment(row.status) && name) {
      s += ` מטפל: ${name}.`
    }
    return s
  })
}
