import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { listWhatsAppConversations } from '@/lib/whatsapp-message-store'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'

export async function GET() {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.whatsapp_inbox)
  if (!auth.ok) return auth.response

  try {
    const admin = getSupabaseAdmin()
    const rows = await listWhatsAppConversations(admin, auth.ctx.clientId)
    return NextResponse.json({ conversations: rows })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'שגיאת שרת' },
      { status: 500 }
    )
  }
}
