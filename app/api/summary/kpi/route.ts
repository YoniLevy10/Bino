import { NextRequest, NextResponse } from 'next/server'
import { requireSessionClientId } from '@/lib/api-auth'
import { TICKET_STATUSES_IN_TREATMENT } from '@/lib/ticket-status'
import {
  SUMMARY_TICKET_SELECT,
  formatSummaryTicket,
  ticketRangeOrFilter,
  type RawSummaryTicketRow,
} from '@/lib/summary-tickets'

/** Cap sample rows for summary cards — full history is `/api/summary/history`. */
const TICKETS_IN_RANGE_LIMIT = 200

function parseIsoParam(value: string | null, _label: string): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/** Summary KPIs + capped ticket sample for cards (not full history). */
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
    const [openRes, treatmentRes, openedRes, closedRes, rangeRes] = await Promise.all([
      admin
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .is('deleted_at', null)
        .eq('status', 'NEW'),
      admin
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .is('deleted_at', null)
        .in('status', [...TICKET_STATUSES_IN_TREATMENT]),
      admin
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .is('deleted_at', null)
        .gte('created_at', from)
        .lt('created_at', to),
      admin
        .from('tickets')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .is('deleted_at', null)
        .gte('closed_at', from)
        .lt('closed_at', to),
      admin
        .from('tickets')
        .select(SUMMARY_TICKET_SELECT)
        .eq('client_id', clientId)
        .is('deleted_at', null)
        .or(rangeFilter)
        .order('created_at', { ascending: false })
        .limit(TICKETS_IN_RANGE_LIMIT),
    ])

    if (
      openRes.error ||
      treatmentRes.error ||
      openedRes.error ||
      closedRes.error ||
      rangeRes.error
    ) {
      return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
    }

    const ticketsInRange = ((rangeRes.data || []) as RawSummaryTicketRow[]).map(formatSummaryTicket)

    return NextResponse.json({
      openNow: openRes.count ?? 0,
      assignedNow: treatmentRes.count ?? 0,
      openedInRange: openedRes.count ?? 0,
      closedInRange: closedRes.count ?? 0,
      ticketsInRange,
    })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
