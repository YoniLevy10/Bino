import { NextRequest, NextResponse } from 'next/server'
import { requireSessionClientId } from '@/lib/api-auth'
import {
  SUMMARY_TICKET_SELECT,
  formatSummaryTicket,
  type RawSummaryTicketRow,
} from '@/lib/summary-tickets'

const HISTORY_PAGE_SIZE = 200
const HISTORY_HARD_MAX = 2000

function parseIsoParam(value: string | null): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/** Closed tickets in date range for the history tab — paginated (no unbounded fetch). */
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

  const rawLimit = Number(req.nextUrl.searchParams.get('limit') || String(HISTORY_PAGE_SIZE))
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.floor(rawLimit), 1), HISTORY_PAGE_SIZE)
    : HISTORY_PAGE_SIZE
  const rawOffset = Number(req.nextUrl.searchParams.get('offset') || '0')
  const offset = Number.isFinite(rawOffset) ? Math.max(Math.floor(rawOffset), 0) : 0
  const projectId = req.nextUrl.searchParams.get('project_id')?.trim() || ''

  if (offset >= HISTORY_HARD_MAX) {
    return NextResponse.json({
      tickets: [],
      total: 0,
      has_more: false,
      truncated: true,
      limit,
      offset,
    })
  }

  const { admin, clientId } = auth.ctx
  const fetchCount = Math.min(limit + 1, HISTORY_HARD_MAX - offset)

  try {
    let query = admin
      .from('tickets')
      .select(SUMMARY_TICKET_SELECT)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .eq('status', 'CLOSED')
      .not('closed_at', 'is', null)
      .gte('closed_at', from)
      .lt('closed_at', to)
      .order('closed_at', { ascending: false })
      .range(offset, offset + fetchCount - 1)

    if (projectId) query = query.eq('project_id', projectId)

    const { data, error } = await query
    if (error) throw error

    const raw = (data || []) as RawSummaryTicketRow[]
    const hasMoreRaw = raw.length > limit
    const page = raw.slice(0, limit)
    const tickets = page.map(formatSummaryTicket)
    const truncated = offset + tickets.length >= HISTORY_HARD_MAX

    return NextResponse.json({
      tickets,
      total: tickets.length,
      has_more: hasMoreRaw && !truncated,
      truncated,
      limit,
      offset,
    })
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}
