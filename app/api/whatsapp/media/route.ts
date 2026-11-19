import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { whatsappMediaQuerySchema } from '@/lib/whatsapp-api-schemas'
import { isWhatsAppInboxV2Enabled } from '@/lib/whatsapp-inbox-v2-flag'
import { parseWhatsAppMessageMediaPayload } from '@/lib/whatsapp-message-media'
import { downloadWhatsAppMedia } from '@/lib/whatsapp-media'

export async function GET(req: NextRequest) {
  if (!isWhatsAppInboxV2Enabled()) {
    return NextResponse.json({ error: 'לא זמין' }, { status: 404 })
  }

  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.whatsapp_inbox)
  if (!auth.ok) return auth.response

  const parsed = whatsappMediaQuerySchema.safeParse({
    message_id: req.nextUrl.searchParams.get('message_id') ?? '',
  })
  if (!parsed.success) {
    return NextResponse.json({ error: 'מזהה הודעה לא תקין' }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const { data: msg, error } = await admin
    .from('whatsapp_messages')
    .select('id, client_id, message_type, interactive_payload')
    .eq('id', parsed.data.message_id)
    .eq('client_id', auth.ctx.clientId)
    .maybeSingle()

  if (error || !msg) {
    return NextResponse.json({ error: 'הודעה לא נמצאה' }, { status: 404 })
  }

  const row = msg as {
    message_type?: string
    interactive_payload?: Record<string, unknown> | null
  }

  const ref = parseWhatsAppMessageMediaPayload(row.interactive_payload)
  if (!ref) {
    return NextResponse.json({ error: 'אין מדיה בהודעה' }, { status: 404 })
  }

  const { data: clientRow } = await admin
    .from('clients')
    .select('whatsapp_access_token')
    .eq('id', auth.ctx.clientId)
    .maybeSingle()

  const accessToken = (clientRow as { whatsapp_access_token?: string } | null)?.whatsapp_access_token
  if (!accessToken) {
    return NextResponse.json({ error: 'WhatsApp לא מוגדר' }, { status: 400 })
  }

  const mediaType =
    ref.kind === 'document' ? 'document' : ref.kind === 'video' ? 'video' : 'image'
  const blob = await downloadWhatsAppMedia(ref.mediaId, mediaType, accessToken)
  if (!blob) {
    return NextResponse.json({ error: 'טעינת מדיה מ-Meta נכשלה' }, { status: 502 })
  }

  return new NextResponse(new Uint8Array(blob.buffer), {
    status: 200,
    headers: {
      'Content-Type': blob.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(blob.fileName)}"`,
      'Cache-Control': 'private, max-age=300',
    },
  })
}