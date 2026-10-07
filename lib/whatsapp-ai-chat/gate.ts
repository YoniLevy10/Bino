/**
 * Opt-in gate for the per-client WhatsApp chatbot.
 *
 * Both must be true. Otherwise the existing WhatsApp flow runs and this
 * module does not read the database:
 *   1. WHATSAPP_AI_CHAT_ENABLED=true
 *   2. client_whatsapp_ai_chat.enabled for that client
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getLogger } from '@/lib/logging'

const logger = getLogger()

export function isWhatsAppAiChatMasterEnabled(): boolean {
  return process.env.WHATSAPP_AI_CHAT_ENABLED === 'true'
}

export async function isClientWhatsAppAiChatEnabled(
  supabaseAdmin: SupabaseClient,
  clientId: string
): Promise<boolean> {
  if (!isWhatsAppAiChatMasterEnabled()) return false
  const id = clientId.trim()
  if (!id) return false

  const { data, error } = await supabaseAdmin
    .from('client_whatsapp_ai_chat')
    .select('enabled')
    .eq('client_id', id)
    .maybeSingle()

  if (error) {
    logger.warn('WEBHOOK', 'WhatsApp AI chat flag unread; keeping existing flow', {
      err: error.message,
    })
    return false
  }

  return (data as { enabled?: boolean } | null)?.enabled === true
}
