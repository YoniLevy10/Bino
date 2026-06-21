import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { whatsappSendBodySchema } from '@/lib/whatsapp-api-schemas'
import {
  persistWhatsAppMessage,
  extractMetaWaMessageId,
  isWithinWhatsAppSessionWindow,
} from '@/lib/whatsapp-message-store'
import { sendWhatsAppTextMessageWithCredentials } from '@/lib/whatsapp-send'
import { insertWhatsAppSendFailure } from '@/lib/error-logs-db'
import { normalizePhone } from '@/lib/residents-whatsapp'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { whatsappDbPhoneKey } from '@/lib/whatsapp-test-phone'

export async function POST(req: Request) {
  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.whatsapp_inbox)
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'whatsapp-send')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const parsed = whatsappSendBodySchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const phone = normalizePhone(whatsappDbPhoneKey(parsed.data.phone))
  if (!phone || phone.startsWith('wa_test_')) {
    return NextResponse.json({ error: 'מספר לא תקין לשליחה' }, { status: 400 })
  }

  const inWindow = await isWithinWhatsAppSessionWindow(admin, auth.ctx.clientId, phone)
  if (!inWindow) {
    return NextResponse.json(
      {
        error: 'חלון 24 שעות הסתיים — לא ניתן לשלוח הודעה חופשית. השתמשו בתבנית Meta מאושרת.',
        code: 'WA_SESSION_EXPIRED',
      },
      { status: 422 }
    )
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

  const result = await sendWhatsAppTextMessageWithCredentials(
    phoneNumberId,
    accessToken,
    phone,
    parsed.data.body
  )

  if (!result) {
    await insertWhatsAppSendFailure(
      auth.ctx.clientId,
      phone,
      parsed.data.body,
      'WhatsApp inbox text send returned null (timeout/error)',
      { send_kind: 'text' }
    )
    return NextResponse.json({ error: 'שליחת WhatsApp נכשלה' }, { status: 502 })
  }

  await persistWhatsAppMessage(admin, {
    clientId: auth.ctx.clientId,
    phone,
    direction: 'out',
    body: parsed.data.body,
    messageType: 'text',
    waMessageId: extractMetaWaMessageId(result),
  })

  return NextResponse.json({ ok: true, wa_message_id: extractMetaWaMessageId(result) })
}
