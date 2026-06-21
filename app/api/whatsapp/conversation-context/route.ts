import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { z } from 'zod'
import { loadWhatsAppInboxContext } from '@/lib/whatsapp-inbox-context'

const querySchema = z.object({
  conversation_id: z.string().uuid(),
})

export async function GET(req: NextRequest) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.whatsapp_inbox)
  if (!auth.ok) return auth.response

  const parsed = querySchema.safeParse({
    conversation_id: req.nextUrl.searchParams.get('conversation_id') ?? '',
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'שיחה לא תקינה' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: conv, error } = await admin
    .from('whatsapp_conversations')
    .select('id, phone, resident_id')
    .eq('id', parsed.data.conversation_id)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()

  if (error || !conv) {
    return NextResponse.json({ error: 'שיחה לא נמצאה' }, { status: 404 })
  }

  const row = conv as { phone: string; resident_id?: string | null }
  const context = await loadWhatsAppInboxContext(admin, auth.ctx.clientId, {
    phone: row.phone,
    residentId: row.resident_id,
  })

  return NextResponse.json({ context })
}
