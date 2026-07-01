import { NextRequest, NextResponse } from 'next/server'
import { requireSessionClientId } from '@/lib/api-auth'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import { TICKET_STATUSES_IN_TREATMENT } from '@/lib/ticket-status'
import {
  SUMMARY_TICKET_SELECT,
  formatSummaryTicket,
  ticketRangeOrFilter,
  type RawSummaryTicketRow,
} from '@/lib/summary-tickets'

function parseIsoParam(value: string | null, label: string): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/** Summary KPIs + tickets in date range (not full history). */
export async function GET(req: NextRequest) {
  const auth = await requireSessionClientId()
  if (!auth.ok) return auth.response

  const from = parseIsoParam(req.nextUrl.searchParams.get('from'), 'from')
  const to = parseIsoParam(req.nextUrl.searchParams.get('to'), 'to')
  if (!from || !to) {
    return NextResponse.json({ error: 'נדרש טווח תאריכים תקין' }, { status: 400 })
  }
  if (new Date(to) <= new Date(from)) {
    return NextResponse.json({ error: 'טווח תאריכים לא תקין' }, { status: 400 })
  }

  const { admin, clientId } = auth.ctx
  const rangeFilter = ticketRangeOrFilter(from, to)

  try {
    const [openRes, treatmentRes, rangeRows] = await Promise.all([
      admin
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .is('deleted_at', null)
        .eq('status', 'NEW'),
      admin
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .is('deleted_at', null)
        .in('status', [...TICKET_STATUSES_IN_TREATMENT]),
      fetchAllRows<RawSummaryTicketRow>((fromIdx, toIdx) =>
        admin
          .from('tickets')
          .select(SUMMARY_TICKET_SELECT)
          .eq('client_id', clientId)
          .is('deleted_at', null)
          .or(rangeFilter)
          .order('created_at', { ascending: false })
          .range(fromIdx, toIdx)
      ),
    ])

    if (openRes.error || treatmentRes.error) {
      return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
    }

    const ticketsInRange = rangeRows.map(formatSummaryTicket)

    return NextResponse.json({
      openNow: openRes.count ?? 0,
      assignedNow: treatmentRes.count ?? 0,
      ticketsInRange,
    })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
