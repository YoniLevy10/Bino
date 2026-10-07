import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { loadWhatsAppInboxContext } from '@/lib/whatsapp-inbox-context'
import {
  isConversationWithinWhatsAppSession,
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
      const [messages, convRes] = await Promise.all([
        listWhatsAppMessagesForConversation(admin, auth.ctx.clientId, parsed.data),
        admin
          .from('whatsapp_conversations')
          .select('phone, resident_id')
          .eq('id', parsed.data)
          .eq('client_id', auth.ctx.clientId)
          .maybeSingle(),
      ])
      const conv = convRes.data as { phone?: string; resident_id?: string | null } | null
      if (convRes.error || !conv?.phone) {
        return NextResponse.json({
          messages,
          conversation_id: parsed.data,
          in_session: false,
          context: null,
        })
      }
      const [inSession, context] = await Promise.all([
        isConversationWithinWhatsAppSession(
          admin,
          auth.ctx.clientId,
          parsed.data,
          conv.phone
        ).catch(() => false),
        loadWhatsAppInboxContext(admin, auth.ctx.clientId, {
          phone: conv.phone,
          residentId: conv.resident_id,
        }).catch(() => null),
      ])
      return NextResponse.json({
        messages,
        conversation_id: parsed.data,
        in_session: inSession,
        context,
      })
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
