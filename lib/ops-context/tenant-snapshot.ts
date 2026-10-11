import type { SupabaseClient } from '@supabase/supabase-js'
import { PAID_ADDON_KEYS, clientHasPaidAddon } from '@/lib/paid-addons'
import {
  listClientProjectGrowRows,
  projectGrowAccountStatus,
} from '@/lib/project-grow'

/** Cross-page operational signals for one tenant (bounded reads). */
export type TenantOpsSnapshot = {
  clientId: string
  generatedAt: string
  tickets: {
    open: number
    unassigned: number
    recurringOpen: number
    /** Open tickets older than 48h still unassigned */
    agingUnassigned: number
  }
  maintenance: {
    overdue: number
  }
  collections: {
    enabled: boolean
    drafts: number
    sendFailed: number
    sentUnpaid: number
    growBuildingsTotal: number
    growBuildingsReady: number
    growBuildingsMissing: number
  }
  hotProjects: Array<{
    id: string
    name: string
    openTickets: number
    recurringOpen: number
  }>
}

type TicketLite = {
  id: string
  project_id: string | null
  assigned_worker_id: string | null
  is_recurring: boolean | null
  created_at: string
  status: string
}

/**
 * Build a single ops snapshot from tickets + maintenance + collections + Grow.
 * All queries are client-scoped and capped — safe for dashboard / recommendations.
 */
export async function buildTenantOpsSnapshot(
  admin: SupabaseClient,
  clientId: string
): Promise<TenantOpsSnapshot> {
  const now = Date.now()
  const agingCutoff = new Date(now - 48 * 3_600_000).toISOString()
  const windowStart = new Date(now - 90 * 86_400_000).toISOString()

  const collectionsEnabled = await clientHasPaidAddon(
    admin,
    clientId,
    PAID_ADDON_KEYS.collections
  )

  const [ticketsRes, maintRes, chargesRes, growRows] = await Promise.all([
    admin
      .from('tickets')
      .select('id, project_id, assigned_worker_id, is_recurring, created_at, status')
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .neq('status', 'CLOSED')
      .gte('created_at', windowStart)
      .limit(400),
    admin
      .from('maintenance_tasks')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .neq('status', 'DONE')
      .not('due_at', 'is', null)
      .lte('due_at', new Date(now).toISOString()),
    collectionsEnabled
      ? admin
          .from('collection_charges')
          .select('id, status')
          .eq('client_id', clientId)
          .in('status', ['draft', 'failed', 'sent'])
          .limit(300)
      : Promise.resolve({ data: [] as { id: string; status: string }[], error: null }),
    collectionsEnabled
      ? listClientProjectGrowRows(admin, clientId)
      : Promise.resolve([]),
  ])

  const tickets = (ticketsRes.data || []) as TicketLite[]
  const open = tickets.length
  const unassigned = tickets.filter((t) => !t.assigned_worker_id).length
  const recurringOpen = tickets.filter((t) => t.is_recurring === true).length
  const agingUnassigned = tickets.filter(
    (t) => !t.assigned_worker_id && t.created_at < agingCutoff
  ).length

  const overdue =
    typeof maintRes.count === 'number' && Number.isFinite(maintRes.count)
      ? maintRes.count
      : 0

  const charges = (chargesRes.data || []) as { id: string; status: string }[]
  let drafts = 0
  let sendFailed = 0
  let sentUnpaid = 0
  for (const c of charges) {
    if (c.status === 'draft') drafts += 1
    else if (c.status === 'failed') sendFailed += 1
    else if (c.status === 'sent') sentUnpaid += 1
  }

  let growReady = 0
  let growMissing = 0
  for (const p of growRows) {
    if (projectGrowAccountStatus(p).ready) growReady += 1
    else growMissing += 1
  }

  const byProject = new Map<
    string,
    { open: number; recurring: number }
  >()
  for (const t of tickets) {
    if (!t.project_id) continue
    const cur = byProject.get(t.project_id) || { open: 0, recurring: 0 }
    cur.open += 1
    if (t.is_recurring) cur.recurring += 1
    byProject.set(t.project_id, cur)
  }

  const topIds = [...byProject.entries()]
    .sort((a, b) => b[1].open - a[1].open || b[1].recurring - a[1].recurring)
    .slice(0, 5)
    .map(([id]) => id)

  const nameById = new Map<string, string>()
  if (topIds.length) {
    const { data: projects } = await admin
      .from('projects')
      .select('id, name')
      .eq('client_id', clientId)
      .in('id', topIds)
      .limit(10)
    for (const p of projects || []) {
      nameById.set(p.id as string, (p.name as string) || 'בניין')
    }
  }

  const hotProjects = topIds.map((id) => {
    const stats = byProject.get(id)!
    return {
      id,
      name: nameById.get(id) || 'בניין',
      openTickets: stats.open,
      recurringOpen: stats.recurring,
    }
  })

  return {
    clientId,
    generatedAt: new Date(now).toISOString(),
    tickets: {
      open,
      unassigned,
      recurringOpen,
      agingUnassigned,
    },
    maintenance: { overdue },
    collections: {
      enabled: collectionsEnabled,
      drafts,
      sendFailed,
      sentUnpaid,
      growBuildingsTotal: growRows.length,
      growBuildingsReady: growReady,
      growBuildingsMissing: growMissing,
    },
    hotProjects,
  }
}
