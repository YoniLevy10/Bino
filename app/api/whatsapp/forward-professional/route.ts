import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSessionWriteAccess } from '@/lib/api-auth'
import { checkAuthenticatedPostRouteLimit } from '@/lib/rate-limit'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { requireClientPaidAddon } from '@/lib/require-paid-addon'
import { isWhatsAppInboxV2Enabled } from '@/lib/whatsapp-inbox-v2-flag'
import { whatsappForwardProfessionalBodySchema } from '@/lib/whatsapp-api-schemas'
import { forwardTicketToProfessional } from '@/lib/forward-ticket-to-professional'
import { buildInboxForwardDryRunPreview } from '@/lib/whatsapp-inbox-forward-preview'

export const maxDuration = 60

/** Forward open ticket to professional from WhatsApp inbox — supports dry_run preview (no SMS). */
export async function POST(req: Request) {
  if (!isWhatsAppInboxV2Enabled()) {
    return NextResponse.json({ error: 'לא זמין' }, { status: 404 })
  }

  const auth = await requireSessionWriteAccess()
  if (!auth.ok) return auth.response

  const raw = await req.json()
  const parsed = whatsappForwardProfessionalBodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const admin = getSupabaseAdmin()
  const clientId = auth.ctx.clientId

  const addonCheck = await requireClientPaidAddon(admin, clientId, PAID_ADDON_KEYS.professionals)
  if (!addonCheck.ok) return addonCheck.response

  const rl = await checkAuthenticatedPostRouteLimit(admin, auth.ctx.userId, 'whatsapp-forward-pro')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const { ticket_id, professional_id, note, set_status_escort, dry_run } = parsed.data

  if (dry_run) {
    const preview = await buildInboxForwardDryRunPreview(admin, {
      ticketId: ticket_id,
      professionalId: professional_id,
      clientId,
      note: note ?? null,
    })
    if (!preview.ok) {
      const status = preview.error.includes('לא נמצא') ? 404 : 400
      return NextResponse.json({ error: preview.error }, { status })
    }
    return NextResponse.json({ dry_run: true, preview: preview.preview })
  }

  const { data: clientRow } = await admin
    .from('clients')
    .select('sms_sender_name')
    .eq('id', clientId)
    .maybeSingle()

  const smsSenderName =
    (clientRow as { sms_sender_name?: string | null } | null)?.sms_sender_name?.trim() || null

  const result = await forwardTicketToProfessional(admin, {
    ticketId: ticket_id,
    professionalId: professional_id,
    clientId,
    note: note ?? null,
    setStatusEscort: set_status_escort !== false,
    smsSenderName,
  })

  if (result.error && !result.sms) {
    const status = result.error.includes('לא נמצא') ? 404 : 400
    return NextResponse.json({ error: result.error }, { status })
  }

  return NextResponse.json({
    ok: result.ok,
    sms_sent: result.sms?.ok ?? false,
    sms_note: result.smsNote,
  })
}