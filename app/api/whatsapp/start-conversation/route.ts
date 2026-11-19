import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { requireSessionClientPaidAddon } from '@/lib/require-paid-addon'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { isWhatsAppInboxV2Enabled } from '@/lib/whatsapp-inbox-v2-flag'
import { whatsappStartConversationBodySchema } from '@/lib/whatsapp-api-schemas'
import { whatsAppConversationPhoneKey } from '@/lib/whatsapp-message-store'
import { normalizePhone } from '@/lib/residents-whatsapp'
import { isDisplayableResidentName } from '@/lib/whatsapp-inbox-display'

export async function POST(req: Request) {
  if (!isWhatsAppInboxV2Enabled()) {
    return NextResponse.json({ error: 'לא זמין' }, { status: 404 })
  }

  const auth = await requireSessionClientPaidAddon(PAID_ADDON_KEYS.whatsapp_inbox)
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'whatsapp-start-conversation')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const parsed = whatsappStartConversationBodySchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  if (!parsed.data.resident_id && !parsed.data.phone) {
    return NextResponse.json({ error: 'יש לבחור דייר או להזין טלפון' }, { status: 400 })
  }

  let phone = parsed.data.phone?.trim() ?? ''
  let residentId: string | null = parsed.data.resident_id ?? null

  if (residentId) {
    const { data: resident, error } = await admin
      .from('residents')
      .select('id, phone, normalized_phone, full_name')
      .eq('id', residentId)
      .eq('client_id', auth.ctx.clientId)
      .is('deleted_at', null)
      .maybeSingle()

    if (error || !resident) {
      return NextResponse.json({ error: 'דייר לא נמצא' }, { status: 404 })
    }

    const row = resident as {
      phone?: string | null
      normalized_phone?: string | null
      full_name?: string | null
    }
    phone = row.normalized_phone || normalizePhone(row.phone || '')
    if (!phone) {
      return NextResponse.json({ error: 'לדייר אין מספר טלפון' }, { status: 400 })
    }
    if (!isDisplayableResidentName(row.full_name)) {
      residentId = null
    }
  } else {
    phone = normalizePhone(phone)
  }

  const storagePhone = whatsAppConversationPhoneKey(phone)
  const now = new Date().toISOString()

  const { data: conv, error: convErr } = await admin
    .from('whatsapp_conversations')
    .upsert(
      {
        client_id: auth.ctx.clientId,
        phone: storagePhone,
        resident_id: residentId,
        last_message_at: now,
        updated_at: now,
      },
      { onConflict: 'client_id,phone' }
    )
    .select('id, phone, resident_id, last_message_at, last_message_preview, residents(full_name, apartment_number)')
    .single()

  if (convErr || !conv?.id) {
    return NextResponse.json({ error: 'יצירת שיחה נכשלה' }, { status: 500 })
  }

  return NextResponse.json({
    conversation: conv,
  })
}