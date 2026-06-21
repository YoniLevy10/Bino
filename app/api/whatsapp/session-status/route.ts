import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isWithinWhatsAppSessionWindow } from '@/lib/whatsapp-message-store'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { whatsappSessionQuerySchema } from '@/lib/whatsapp-api-schemas'
import { whatsappDbPhoneKey } from '@/lib/whatsapp-test-phone'
import { WHATSAPP_INBOX_META_TEMPLATES } from '@/lib/whatsapp-inbox-meta-templates'

export async function GET(req: NextRequest) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.whatsapp_inbox)
  if (!auth.ok) return auth.response

  const parsed = whatsappSessionQuerySchema.safeParse({
    phone: req.nextUrl.searchParams.get('phone') ?? '',
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'מספר לא תקין' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const phone = whatsappDbPhoneKey(parsed.data.phone)
  const inSession = await isWithinWhatsAppSessionWindow(admin, auth.ctx.clientId, phone)

  return NextResponse.json({
    in_session: inSession,
    templates: WHATSAPP_INBOX_META_TEMPLATES.map((t) => ({
      id: t.id,
      label: t.label,
      description: t.description,
      params: t.params,
      preview: t.preview,
    })),
  })
}
