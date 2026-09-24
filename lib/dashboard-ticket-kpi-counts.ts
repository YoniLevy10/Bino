import { withClientId } from '@/lib/supabase/with-client-id'
import { TICKET_STATUSES_IN_TREATMENT } from '@/lib/ticket-status'
import type { SupabaseClient } from '@supabase/supabase-js'

export type DashboardTicketKpiCounts = {
  /** Non-closed, not soft-deleted */
  active: number
  /** status = NEW */
  open: number
  /** Assigned / in progress / waiting / site tour / escort */
  inProgress: number
  /** status = CLOSED, not soft-deleted */
  closed: number
}

export const EMPTY_DASHBOARD_TICKET_KPI_COUNTS: DashboardTicketKpiCounts = {
  active: 0,
  open: 0,
  inProgress: 0,
  closed: 0,
}

type CountClient = Pick<SupabaseClient, 'from' | 'rpc'>

/** Exact tenant ticket KPIs via single RPC (fallback: four parallel head counts). */
export async function fetchDashboardTicketKpiCounts(
  supabase: CountClient,
  clientId: string
): Promise<DashboardTicketKpiCounts> {
  try {
    const { data, error } = await supabase.rpc('dashboard_ticket_kpi_counts', {
      p_client_id: clientId,
    })
    if (!error && data != null) {
      const row = (Array.isArray(data) ? data[0] : data) as {
        active?: number | string | null
        open_count?: number | string | null
        in_progress?: number | string | null
        closed?: number | string | null
      } | null
      if (row) {
        return {
          active: Number(row.active ?? 0),
          open: Number(row.open_count ?? 0),
          inProgress: Number(row.in_progress ?? 0),
          closed: Number(row.closed ?? 0),
        }
      }
    }
  } catch {
    /* fall through to head counts */
  }

  const base = () =>
    withClientId(supabase.from('tickets').select('id', { count: 'exact', head: true }), clientId).is(
      'deleted_at',
      null
    )

  const [activeResult, openResult, inProgressResult, closedResult] = await Promise.all([
    base().neq('status', 'CLOSED'),
    base().eq('status', 'NEW'),
    base().in('status', [...TICKET_STATUSES_IN_TREATMENT]),
    base().eq('status', 'CLOSED'),
  ])

  return {
    active: activeResult.count ?? 0,
    open: openResult.count ?? 0,
    inProgress: inProgressResult.count ?? 0,
    closed: closedResult.count ?? 0,
  }
}

/** Merge legacy cache that only stored `closedCount` + open list length. */
export function resolveDashboardTicketKpiCounts(cached: {
  ticketKpis?: Partial<DashboardTicketKpiCounts> | null
  closedCount?: number | null
  tickets?: { status: string }[] | null
}): DashboardTicketKpiCounts {
  if (cached.ticketKpis) {
    return {
      active: cached.ticketKpis.active ?? 0,
      open: cached.ticketKpis.open ?? 0,
      inProgress: cached.ticketKpis.inProgress ?? 0,
      closed: cached.ticketKpis.closed ?? cached.closedCount ?? 0,
    }
  }
  const tickets = cached.tickets ?? []
  return {
    active: tickets.length,
    open: tickets.filter((t) => t.status === 'NEW').length,
    inProgress: tickets.filter((t) =>
      (TICKET_STATUSES_IN_TREATMENT as readonly string[]).includes(t.status)
    ).length,
    closed: cached.closedCount ?? 0,
  }
}
