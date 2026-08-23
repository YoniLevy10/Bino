import type { SupabaseClient } from '@supabase/supabase-js'

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
): Promise<{
  id: string
  status: string
  created_at: string
  ticket_number: number
  project_id: string | null
} | null> {
  const { data, error } = await supabaseAdmin
    .from('tickets')
    .select('id, status, created_at, ticket_number, project_id')
    .eq('reporter_phone', from)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .neq('status', 'CLOSED')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (
    error ||
    !data?.id ||
    !data?.created_at ||
    !data?.status ||
    typeof data.ticket_number !== 'number'
  ) {
    return null
  }
  return data as {
    id: string
    status: string
    created_at: string
    ticket_number: number
    project_id: string | null
  }
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

/** Last project this reporter opened a ticket in — speeds repeat reports for unapproved residents. */
export async function readLastReporterProject(
  supabaseAdmin: SupabaseClient,
  clientId: string,
  phone: string
): Promise<{ projectId: string; projectName: string } | null> {
  const { data: ticketRow, error: ticketErr } = await supabaseAdmin
    .from('tickets')
    .select('project_id')
    .eq('client_id', clientId)
    .eq('reporter_phone', phone)
    .is('deleted_at', null)
    .not('project_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (ticketErr || !ticketRow?.project_id) return null
  const projectId = ticketRow.project_id as string

  const { data: projectRow } = await supabaseAdmin
    .from('projects')
    .select('name')
    .eq('id', projectId)
    .eq('client_id', clientId)
    .maybeSingle()

  const projectName = (projectRow as { name?: string | null } | null)?.name?.trim()
  if (!projectName) return null
  return { projectId, projectName }
}
