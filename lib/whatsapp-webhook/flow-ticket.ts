import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParsedWhatsAppMessage } from '@/lib/whatsapp-parser'

export type WaLocation = NonNullable<ParsedWhatsAppMessage['location']>

/** Normalize description for duplicate comparison (trim, lowercase, collapse whitespace). */
export function normalizeTicketDescriptionForCompare(description: string): string {
  return description.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Parse DB/app duplicate guard errors like `recent_duplicate_whatsapp_ticket:29`. */
export function parseRecentDuplicateWhatsAppTicketError(message: string): number | null {
  const match = message.trim().match(/^recent_duplicate_whatsapp_ticket:(\d+)$/i)
  if (!match) return null
  const ticketNumber = Number.parseInt(match[1], 10)
  return Number.isFinite(ticketNumber) && ticketNumber > 0 ? ticketNumber : null
}

export function isBenignWhatsAppTicketDuplicateError(message: string): boolean {
  return parseRecentDuplicateWhatsAppTicketError(message) !== null
}

/** Open WhatsApp ticket from same reporter with identical description (product duplicate rule). */
export async function findDuplicateOpenWhatsAppTicket(
  from: string,
  clientId: string,
  description: string,
  supabaseAdmin: SupabaseClient
): Promise<{ id: string; ticket_number: number } | null> {
  const normalized = normalizeTicketDescriptionForCompare(description)
  if (normalized.length < 3) return null

  const { data, error } = await supabaseAdmin
    .from('tickets')
    .select('id, ticket_number, description')
    .eq('reporter_phone', from)
    .eq('client_id', clientId)
    .eq('source', 'whatsapp')
    .is('deleted_at', null)
    .neq('status', 'CLOSED')
    .order('created_at', { ascending: false })
    .limit(8)

  if (error || !data?.length) return null

  for (const row of data) {
    const rowDescription = typeof row.description === 'string' ? row.description : ''
    if (normalizeTicketDescriptionForCompare(rowDescription) === normalized) {
      return {
        id: row.id as string,
        ticket_number: row.ticket_number as number,
      }
    }
  }

  return null
}

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

/** Most recent non-closed ticket for this reporter + tenant (no time limit). */
export async function findOpenTicketForPhone(
  from: string,
  supabaseAdmin: SupabaseClient,
  clientId: string
): Promise<{ id: string; status: string; created_at: string } | null> {
  const { data, error } = await supabaseAdmin
    .from('tickets')
    .select('id, status, created_at')
    .eq('reporter_phone', from)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .neq('status', 'CLOSED')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data?.id || !data?.created_at || !data?.status) return null
  return data as { id: string; status: string; created_at: string }
}

/** @deprecated Prefer findOpenTicketForPhone — kept for callers that still use the short window. */
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
