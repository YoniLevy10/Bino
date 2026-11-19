import { SupabaseClient } from '@supabase/supabase-js'
import { clearPendingSelection } from '@/lib/whatsapp-webhook/project-selection'
import { promoteStashedMediaToSession } from '@/lib/whatsapp-webhook/building-search-stash'
import { getLogger } from '@/lib/shared/logging'

const logger = getLogger()

export async function afterResidentSessionCreated(
  phone: string,
  sessionId: string | null | undefined,
  supabaseAdmin: SupabaseClient,
  clientId: string
): Promise<void> {
  if (!sessionId) return
  await promoteStashedMediaToSession(phone, sessionId, supabaseAdmin, clientId)
}

export async function resetSessionCompletely(
  from: string,
  supabaseAdmin: SupabaseClient,
  clientId: string,
  reason: string
) {
  const nowIso = new Date().toISOString()
  logger.debug('WEBHOOK', 'session reset', { reason })

  // 1) Clear any pending multi-match selection state (prevents being stuck on "reply 1/2/3")
  await clearPendingSelection(from, supabaseAdmin, clientId)

  // 2) Deactivate all active sessions for this phone (prevents old project/ticket context leaking)
  const { error } = await supabaseAdmin
    .from('sessions')
    .update({
      is_active: false,
      active_ticket_id: null,
      pending_ticket_description: null,
      last_activity_at: nowIso,
      updated_at: nowIso,
    })
    .eq('phone_number', from)
    .eq('client_id', clientId)
    .eq('is_active', true)

  if (error) {
    logger.warn('WEBHOOK', 'SESSION_RESET_FAILED', { reason, err: error.message })
  }
}

export async function getTicketStatus(ticketId: string, supabaseAdmin: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('tickets')
    .select('status')
    .eq('id', ticketId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) {
    logger.warn('WEBHOOK', 'fetch ticket status failed', { ticketId, err: error.message })
    return null
  }

  return (data as { status?: string } | null)?.status || null
}
