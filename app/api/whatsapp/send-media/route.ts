import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { isWhatsAppInboxV2Enabled } from '@/lib/whatsapp-inbox-v2-flag'
import {
  extractMetaWaMessageId,
  isWithinWhatsAppSessionWindow,
  persistWhatsAppMessage,
} from '@/lib/whatsapp-message-store'
import { insertWhatsAppSendFailure } from '@/lib/error-logs-db'
import { normalizePhone } from '@/lib/residents-whatsapp'
import { whatsappDbPhoneKey } from '@/lib/whatsapp-test-phone'
import {
  mimeToOutboundKind,
  sendWhatsAppMediaByIdWithCredentials,
  uploadWhatsAppMediaToMeta,
  WA_INBOX_OUTBOUND_MAX_BYTES,
} from '@/lib/whatsapp-outbound-media'
import { buildWhatsAppMessageMediaPayload } from '@/lib/whatsapp-message-media'

export const maxDuration = 60

export async function POST(req: Request) {
  if (!isWhatsAppInboxV2Enabled()) {
    return NextResponse.json({ error: 'לא זמין' }, { status: 404 })
  }

  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.whatsapp_inbox)
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'whatsapp-send-media')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'נתונים לא תקינים' }, { status: 400 })
  }

  const phoneRaw = String(form.get('phone') ?? '')
  const phone = normalizePhone(whatsappDbPhoneKey(phoneRaw))
  if (!phone || phone.startsWith('wa_test_')) {
    return NextResponse.json({ error: 'מספר לא תקין' }, { status: 400 })
  }

  const caption = String(form.get('caption') ?? '').trim() || undefined
  const conversationId = String(form.get('conversation_id') ?? '').trim() || undefined
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'קובץ חסר' }, { status: 400 })
  }

  if (file.size > WA_INBOX_OUTBOUND_MAX_BYTES) {
    return NextResponse.json({ error: 'הקובץ גדול מדי (מקס׳ 16MB)' }, { status: 400 })
  }

  const kind = mimeToOutboundKind(file.type || 'application/octet-stream')
  if (!kind) {
    return NextResponse.json({ error: 'סוג קובץ לא נתמך — תמונה או PDF בלבד' }, { status: 400 })
  }

  const inWindow = await isWithinWhatsAppSessionWindow(admin, auth.ctx.clientId, phone)
  if (!inWindow) {
    return NextResponse.json(
      {
        error: 'חלון 24 שעות סגור — לא ניתן לשלוח קובץ. שלחו קודם תבנית Meta.',
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

  const buffer = Buffer.from(await file.arrayBuffer())
  const upload = await uploadWhatsAppMediaToMeta(
    phoneNumberId,
    accessToken,
    buffer,
    file.type || (kind === 'image' ? 'image/jpeg' : 'application/pdf'),
    file.name || (kind === 'image' ? 'image.jpg' : 'document.pdf')
  )

  if (!upload.ok) {
    return NextResponse.json({ error: upload.error }, { status: 502 })
  }

  const result = await sendWhatsAppMediaByIdWithCredentials(
    phoneNumberId,
    accessToken,
    phone,
    kind,
    upload.mediaId,
    { caption, filename: file.name }
  )

  if (!result) {
    await insertWhatsAppSendFailure(
      auth.ctx.clientId,
      phone,
      file.name,
      'WhatsApp inbox media send returned null',
      { send_kind: kind }
    )
    return NextResponse.json({ error: 'שליחת קובץ נכשלה' }, { status: 502 })
  }

  const waId = extractMetaWaMessageId(result)
  const preview =
    kind === 'image' ? (caption ? `תמונה: ${caption.slice(0, 80)}` : 'תמונה') : `מסמך: ${file.name}`

  await persistWhatsAppMessage(admin, {
    clientId: auth.ctx.clientId,
    phone,
    direction: 'out',
    body: preview,
    messageType: kind === 'image' ? 'image' : 'document',
    waMessageId: waId,
    interactivePayload: buildWhatsAppMessageMediaPayload(
      upload.mediaId,
      kind === 'document' ? 'document' : 'image'
    ),
  })

  return NextResponse.json({
    ok: true,
    wa_message_id: waId,
    conversation_id: conversationId ?? null,
    media_kind: kind,
  })
}