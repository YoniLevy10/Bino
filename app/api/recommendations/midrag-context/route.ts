import { NextRequest, NextResponse } from 'next/server'
import { requireSessionClientId } from '@/lib/api-auth'
import { checkAuthenticatedReadRouteLimit } from '@/lib/rate-limit'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { suggestTradeFromTicketDescription } from '@/lib/midrag/ticket-trade-map'
import { cityFromProjectAddress } from '@/lib/midrag/city-from-address'

/** Prefill Midrag search from a ticket — never invents profession/city. */
export async function GET(req: NextRequest) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const admin = getSupabaseAdmin()
  const rl = await checkAuthenticatedReadRouteLimit(admin, auth.ctx.userId, 'recommendations-midrag-ctx')
  if (rl.isLimited) {
    return NextResponse.json({ error: 'יותר מדי בקשות. נסו שוב בעוד דקה.' }, { status: 429 })
  }

  const ticketId = req.nextUrl.searchParams.get('ticket_id')?.trim()
  if (!ticketId) {
    return NextResponse.json({ error: 'חסר ticket_id' }, { status: 400 })
  }

  const { data: ticket, error } = await admin
    .from('tickets')
    .select('id, description, project_id, projects(address, name)')
    .eq('id', ticketId)
    .eq('client_id', auth.ctx.clientId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!ticket) return NextResponse.json({ error: 'קריאה לא נמצאה' }, { status: 404 })

  const project = Array.isArray(ticket.projects) ? ticket.projects[0] : ticket.projects
  const address = (project as { address?: string | null } | null)?.address ?? null
  const trade = suggestTradeFromTicketDescription(ticket.description as string | null)
  const city = cityFromProjectAddress(address)

  let suggestionNote: string | null = null
  if (trade.confidence === 'none') {
    suggestionNote = 'לא זוהה מקצוע מהתקלה — נא לבחור ידנית.'
  } else if (trade.confidence === 'ambiguous') {
    suggestionNote = 'נמצאו כמה מקצועות אפשריים — נא לאשר או לשנות.'
  }
  if (!city) {
    suggestionNote = suggestionNote
      ? `${suggestionNote} עיר לא זוהתה מכתובת הבניין.`
      : 'עיר לא זוהתה מכתובת הבניין — נא לבחור ידנית.'
  }

  return NextResponse.json({
    ticket_id: ticket.id,
    initial_sector_id: trade.confidence === 'high' ? trade.sectorId : null,
    candidates: trade.candidates,
    confidence: trade.confidence,
    initial_city_id: city?.cityId ?? null,
    initial_area_name: city?.areaName ?? null,
    city_label: city?.label ?? null,
    suggestion_note: suggestionNote,
  })
}
