import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParsedWhatsAppMessage } from '@/lib/whatsapp-parser'

export type WaLocation = NonNullable<ParsedWhatsAppMessage['location']>

/** Same reporter + tenant, non-closed ticket opened within the last N seconds (duplicate guard). */
export async function findOpenTicketForReporterInWindow(
  from: string,
  clientId: string,
  windowSeconds: number,
  supabaseAdmin: SupabaseClient
): Promise<{ id: string; ticket_number: number; description: string | null; status: string } | null> {
  const sinceIso = new Date(Date.now() - windowSeconds * 1000).toISOString()
  const { data, error } = await supabaseAdmin
    .from('tickets')
    .select('id, ticket_number, description, status')
    .eq('reporter_phone', from)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .neq('status', 'CLOSED')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data?.id) return null
  return data as { id: string; ticket_number: number; description: string | null; status: string }
}

export async function findRecentTicketForPhone(
  from: string,
  supabaseAdmin: SupabaseClient,
  clientId: string
): Promise<{ id: string; status: string; created_at: string } | null> {
  const windowMinutes = 10
  const sinceIso = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString()

  const { data, error } = await supabaseAdmin
    .from('tickets')
    .select('id, status, created_at')
    .eq('reporter_phone', from)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data?.id || !data?.created_at || !data?.status) return null
  return data as { id: string; status: string; created_at: string }
}

export async function mergeWhatsAppLocationIntoTicketMetadata(
  admin: SupabaseClient,
  ticketId: string,
  loc: WaLocation
) {
  const { data } = await admin
    .from('tickets')
    .select('ticket_metadata')
    .eq('id', ticketId)
    .is('deleted_at', null)
    .maybeSingle()
  const raw = (data as { ticket_metadata?: unknown } | null)?.ticket_metadata
  const prev =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {}
  const next = {
    ...prev,
    whatsapp_location: {
      lat: loc.lat,
      lng: loc.lng,
      name: loc.name,
      address: loc.address,
      received_at: new Date().toISOString(),
    },
  }
  await admin
    .from('tickets')
    .update({ ticket_metadata: next })
    .eq('id', ticketId)
    .is('deleted_at', null)
}
