import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { whatsappSendTemplateBodySchema } from '@/lib/whatsapp-api-schemas'
import {
  persistWhatsAppMessage,
  extractMetaWaMessageId,
} from '@/lib/whatsapp-message-store'
import { sendWhatsAppTemplateMessageWithCredentials } from '@/lib/whatsapp-send'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { whatsappDbPhoneKey } from '@/lib/whatsapp-test-phone'
import {
  buildInboxTemplatePreview,
  getInboxMetaTemplateById,
} from '@/lib/whatsapp-inbox-meta-templates'
import { normalizePhone } from '@/lib/residents-whatsapp'

export async function POST(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.whatsapp_inbox)
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'whatsapp-send-template')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const parsed = whatsappSendTemplateBodySchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const catalog = getInboxMetaTemplateById(parsed.data.template_id)
  if (!catalog) {
    return NextResponse.json({ error: 'תבנית לא נמצאה' }, { status: 400 })
  }

  if (parsed.data.params.length !== catalog.params.length) {
    return NextResponse.json(
      { error: `נדרשים ${catalog.params.length} שדות לתבנית זו` },
      { status: 400 }
    )
  }

  for (let i = 0; i < catalog.params.length; i++) {
    if (!parsed.data.params[i]?.trim()) {
      return NextResponse.json(
        { error: `שדה חובה: ${catalog.params[i].label}` },
        { status: 400 }
      )
    }
  }

  const phone = normalizePhone(whatsappDbPhoneKey(parsed.data.phone))
  if (!phone || phone.startsWith('wa_test_')) {
    return NextResponse.json({ error: 'מספר לא תקין לשליחה' }, { status: 400 })
  }

  const { data: clientRow } = await admin
    .from('clients')
    .select('whatsapp_phone_number_id, whatsapp_access_token')
    .eq('id', auth.ctx.clientId)
    .maybeSingle()

  const phoneNumberId = (clientRow as { whatsapp_phone_number_id?: string } | null)?.whatsapp_phone_number_id
  const accessToken = (clientRow as { whatsapp_access_token?: string } | null)?.whatsapp_access_token

  if (!phoneNumberId || !accessToken) {
    return NextResponse.json({ error: 'WhatsApp לא מוגדר ללקוח' }, { status: 400 })
  }

  const templateName = catalog.resolveMetaName()
  const bodyParams = parsed.data.params.map((p) => p.trim())

  const result = await sendWhatsAppTemplateMessageWithCredentials(
    phone,
    templateName,
    bodyParams,
    { phoneNumberId, accessToken },
    catalog.language,
    { clientId: auth.ctx.clientId }
  )

  if (!result) {
    return NextResponse.json(
      {
        error: `שליחת תבנית "${templateName}" נכשלה — ודאו שהיא מאושרת ב-Meta.`,
        code: 'WA_TEMPLATE_FAILED',
      },
      { status: 502 }
    )
  }

  const previewBody = buildInboxTemplatePreview(catalog, bodyParams)
  await persistWhatsAppMessage(admin, {
    clientId: auth.ctx.clientId,
    phone,
    direction: 'out',
    body: `[תבנית: ${catalog.label}] ${previewBody}`,
    messageType: 'template',
    waMessageId: extractMetaWaMessageId(result),
  })

  return NextResponse.json({
    ok: true,
    wa_message_id: extractMetaWaMessageId(result),
    template_name: templateName,
  })
}
