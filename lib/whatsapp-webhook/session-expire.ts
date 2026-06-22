import type { SupabaseClient } from '@supabase/supabase-js'
import { getLogger } from '@/lib/logging'

const logger = getLogger()

/** Expire temporary WhatsApp session flow state if inactive (does not close tickets). */
export async function expireInactiveSessions(supabaseAdmin: SupabaseClient, clientId: string) {
  const now = new Date()
  const incompleteThreshold = new Date(now.getTime() - 20 * 60 * 1000)
  const followUpThreshold = new Date(now.getTime() - 30 * 60 * 1000)

  try {
    const { error: incompleteError } = await supabaseAdmin
      .from('sessions')
      .update({
        is_active: false,
        updated_at: now.toISOString(),
      })
      .eq('client_id', clientId)
      .eq('is_active', true)
      .is('active_ticket_id', null)
      .lt('last_activity_at', incompleteThreshold.toISOString())

    if (incompleteError) {
      logger.warn('WEBHOOK', 'expire incomplete sessions failed', { err: incompleteError.message })
    }

    const { error: followUpError } = await supabaseAdmin
      .from('sessions')
      .update({
        is_active: false,
        active_ticket_id: null,
        updated_at: now.toISOString(),
      })
      .eq('client_id', clientId)
      .eq('is_active', true)
      .not('active_ticket_id', 'is', null)
      .lt('last_activity_at', followUpThreshold.toISOString())

    if (followUpError) {
      logger.warn('WEBHOOK', 'expire follow-up sessions failed', { err: followUpError.message })
    }
  } catch (error) {
    logger.warn('WEBHOOK', 'expireInactiveSessions unexpected error', {
      err: error instanceof Error ? error.message : String(error),
    })
  }
}

export type SessionRow = {
  id: string
  phone_number: string
  project_id: string | null
  active_ticket_id: string | null
  is_active: boolean
  pending_whatsapp_media_id?: string | null
  pending_whatsapp_media_type?: string | null
  pending_apartment_detail?: string | null
}

export async function getActiveSession(
  from: string,
  supabaseAdmin: SupabaseClient,
  clientId: string
): Promise<SessionRow | null> {
  const { data, error } = await supabaseAdmin
    .from('sessions')
    .select('id, phone_number, project_id, active_ticket_id, is_active')
    .eq('phone_number', from)
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('last_activity_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    logger.warn('WEBHOOK', 'fetch active session failed', { err: error.message })
    return null
  }

  return (data as SessionRow | null) || null
}
