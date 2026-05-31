import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { buildFlowTemplateRowsForClient } from '@/lib/sync-whatsapp-templates'
import { clearWhatsAppTemplateCache } from '@/lib/whatsapp-templates'
import { WHATSAPP_TEMPLATE_KEYS, SMS_TEMPLATE_KEYS } from '@/lib/whatsapp-template-keys'

export async function POST() {
  try {
    const auth = await requireSessionClientId()
    if (!auth.ok) return auth.response
    const clientId = auth.ctx.clientId

    const admin = getSupabaseAdmin()
    const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'sync-whatsapp-templates')
    if (rl.isLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
    }

    const rows = buildFlowTemplateRowsForClient(clientId)
    const { error } = await admin.from('whatsapp_templates').upsert(rows, {
      onConflict: 'client_id,template_key',
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    clearWhatsAppTemplateCache(clientId)

    return NextResponse.json({
      ok: true,
      synced_count: rows.length,
      whatsapp_keys: WHATSAPP_TEMPLATE_KEYS.length,
      sms_keys: SMS_TEMPLATE_KEYS.length,
    })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
