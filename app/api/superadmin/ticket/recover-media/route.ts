import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isSuperAdminRequest, superAdminUnauthorizedResponse } from '@/lib/superadmin-auth'
import { recoverAllWhatsAppMediaForTicket } from '@/lib/whatsapp-recover-stashed-media'

const bodySchema = z.object({
  client_id: z.string().uuid(),
  ticket_number: z.number().int().positive(),
})

/** Superadmin: attach stashed WhatsApp media to a ticket by number (e.g. ticket #27). */
export async function POST(req: Request) {
  if (!isSuperAdminRequest(req)) return superAdminUnauthorizedResponse()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { client_id: clientId, ticket_number: ticketNumber } = parsed.data
  const admin = getSupabaseAdmin()

  const { data: ticket, error: ticketErr } = await admin
    .from('tickets')
    .select('id, status, reporter_phone, ticket_number')
    .eq('client_id', clientId)
    .eq('ticket_number', ticketNumber)
    .is('deleted_at', null)
    .maybeSingle()

  if (ticketErr) {
    return NextResponse.json({ error: ticketErr.message }, { status: 500 })
  }
  if (!ticket?.id) {
    return NextResponse.json({ error: `תקלה #${ticketNumber} לא נמצאה` }, { status: 404 })
  }

  const reporterPhone = (ticket.reporter_phone as string | null)?.trim() ?? ''
  if (!reporterPhone) {
    return NextResponse.json({ error: 'אין טלפון דייר לתקלה' }, { status: 400 })
  }

  const { data: clientRow } = await admin
    .from('clients')
    .select('whatsapp_access_token')
    .eq('id', clientId)
    .maybeSingle()

  const accessToken =
    (clientRow as { whatsapp_access_token?: string | null } | null)?.whatsapp_access_token ?? undefined

  const result = await recoverAllWhatsAppMediaForTicket(
    admin,
    clientId,
    ticket.id as string,
    reporterPhone,
    accessToken
  )

  if (!result.recovered) {
    const messages: Record<string, string> = {
      NO_STASHED_MEDIA: 'לא נמצאה מדיה שמורה בסשן עבור הטלפון הזה',
      MISSING_ACCESS_TOKEN: 'חסר WhatsApp access token אצל הלקוח',
      ATTACH_FAILED: 'הורדה מ-Meta נכשלה — ייתכן שפג תוקף מזהה המדיה',
      NOT_FOUND: 'לא נמצאה מדיה לשחזור',
    }
    return NextResponse.json(
      {
        recovered: false,
        ticket_id: ticket.id,
        ticket_number: ticketNumber,
        reason: result.reason,
        sessions_tried: result.sessions_tried ?? 0,
        error: messages[result.reason ?? ''] ?? 'שחזור נכשל',
      },
      { status: result.reason === 'NO_STASHED_MEDIA' || result.reason === 'NOT_FOUND' ? 404 : 502 }
    )
  }

  return NextResponse.json({
    recovered: true,
    ticket_id: ticket.id,
    ticket_number: ticketNumber,
    method: result.method,
    sessions_tried: result.sessions_tried,
    storage_files_linked: result.storage_files_linked,
    already_had_attachments: result.reason === 'ALREADY_HAS_ATTACHMENTS',
  })
}
