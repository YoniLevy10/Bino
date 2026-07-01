import { NextRequest, NextResponse } from 'next/server'
import { requireSessionClientId } from '@/lib/api-auth'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import {
  SUMMARY_TICKET_SELECT,
  formatSummaryTicket,
  ticketRangeOrFilter,
  type RawSummaryTicketRow,
} from '@/lib/summary-tickets'

function parseIsoParam(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/** Closed tickets in date range for the history tab. */
export async function GET(req: NextRequest) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const from = parseIsoParam(req.nextUrl.searchParams.get('from'))
  const to = parseIsoParam(req.nextUrl.searchParams.get('to'))
  if (!from || !to) {
    return NextResponse.json({ error: 'נדרש טווח תאריכים תקין' }, { status: 400 })
  }
  if (new Date(to) <= new Date(from)) {
    return NextResponse.json({ error: 'טווח תאריכים לא תקין' }, { status: 400 })
  }

  const { admin, clientId } = auth.ctx
  const rangeFilter = ticketRangeOrFilter(from, to)

  try {
    const rows = await fetchAllRows<RawSummaryTicketRow>((fromIdx, toIdx) =>
      admin
        .from('tickets')
        .select(SUMMARY_TICKET_SELECT)
        .eq('client_id', clientId)
        .is('deleted_at', null)
        .eq('status', 'CLOSED')
        .not('closed_at', 'is', null)
        .or(rangeFilter)
        .order('closed_at', { ascending: false })
        .range(fromIdx, toIdx)
    )

    const tickets = rows.map(formatSummaryTicket)

    return NextResponse.json({ tickets, total: tickets.length })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
