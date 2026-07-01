import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  listWhatsAppMessagesForConversation,
  loadWhatsAppThreadForPhone,
  whatsAppConversationPhoneKey,
} from '@/lib/whatsapp-message-store'
import { listTicketWhatsAppMessages } from '@/lib/whatsapp-ticket-reply'
import { requireSessionClientId } from '@/lib/api-auth'

/** Read message history — same thread as inbox (by conversation_id, ticket_id, or phone). */
export async function GET(req: Request) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const conversationId = url.searchParams.get('conversation_id')
  const ticketId = url.searchParams.get('ticket_id')
  const phone = url.searchParams.get('phone')

  if (!conversationId && !ticketId && !phone) {
    return NextResponse.json({ error: 'conversation_id, ticket_id או phone נדרש' }, { status: 400 })
  }

  try {
    const admin = getSupabaseAdmin()
    if (ticketId) {
      const thread = await listTicketWhatsAppMessages(admin, auth.ctx.clientId, ticketId)
      return NextResponse.json({
        messages: thread.messages,
        conversation_id: thread.conversation_id,
      })
    }
    if (conversationId) {
      const messages = await listWhatsAppMessagesForConversation(admin, auth.ctx.clientId, conversationId)
      return NextResponse.json({ messages, conversation_id: conversationId })
    }
    const thread = await loadWhatsAppThreadForPhone(
      admin,
      auth.ctx.clientId,
      whatsAppConversationPhoneKey(phone!)
    )
    return NextResponse.json({
      messages: thread.messages,
      conversation_id: thread.conversation_id,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'שגיאת שרת' },
      { status: 500 }
    )
  }
}
