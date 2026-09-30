import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import {
  listWhatsAppMessagesForConversation,
  loadWhatsAppThreadForPhone,
  whatsAppConversationPhoneKey,
} from '@/lib/whatsapp-message-store'
import { listTicketWhatsAppMessages } from '@/lib/whatsapp-ticket-reply'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { z } from 'zod'

const conversationIdSchema = z.string().uuid()

/** Read message history — same thread as inbox (by conversation_id, ticket_id, or phone). */
export async function GET(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.whatsapp_inbox)
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const conversationIdRaw = url.searchParams.get('conversation_id')
  const ticketId = url.searchParams.get('ticket_id')
  const phone = url.searchParams.get('phone')

  if (!conversationIdRaw && !ticketId && !phone) {
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
    if (conversationIdRaw) {
      const parsed = conversationIdSchema.safeParse(conversationIdRaw)
      if (!parsed.success) {
        return NextResponse.json({ error: 'מזהה שיחה לא תקין' }, { status: 400 })
      }
      const messages = await listWhatsAppMessagesForConversation(
        admin,
        auth.ctx.clientId,
        parsed.data
      )
      return NextResponse.json({ messages, conversation_id: parsed.data })
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
    console.error('[whatsapp/messages]', e instanceof Error ? e.message : e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'שגיאת שרת' },
      { status: 500 }
    )
  }
}
