import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { listWhatsAppMessagesForConversation, listWhatsAppMessagesForPhone } from '@/lib/whatsapp-message-store'
import { requireSessionClientId } from '@/lib/api-auth'

/** Read message history — available to any authenticated tenant (e.g. ticket drawer). */
export async function GET(req: Request) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const conversationId = url.searchParams.get('conversation_id')
  const phone = url.searchParams.get('phone')

  if (!conversationId && !phone) {
    return NextResponse.json({ error: 'conversation_id או phone נדרש' }, { status: 400 })
  }

  try {
    const admin = getSupabaseAdmin()
    const messages = conversationId
      ? await listWhatsAppMessagesForConversation(admin, auth.ctx.clientId, conversationId)
      : await listWhatsAppMessagesForPhone(admin, auth.ctx.clientId, phone!)
    return NextResponse.json({ messages })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'שגיאת שרת' },
      { status: 500 }
    )
  }
}
