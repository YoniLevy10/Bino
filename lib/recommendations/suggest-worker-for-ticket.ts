import type { SupabaseClient } from '@supabase/supabase-js'
import {
  suggestWorkerForTicket,
  type SuggestWorkerResult,
  type SuggestWorkerTicket,
} from '@/lib/recommendations/suggest-worker'

/**
 * Load bounded history + workers and run the heuristic for one ticket.
 */
export async function suggestWorkerForTicketId(
  admin: SupabaseClient,
  clientId: string,
  ticketId: string
): Promise<SuggestWorkerResult | null> {
  const { data: ticket, error } = await admin
    .from('tickets')
    .select('id, project_id, description, assigned_worker_id, status, created_at, closed_at')
    .eq('id', ticketId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !ticket) return null
  const t = ticket as SuggestWorkerTicket
  if (!t.project_id) return null

  const since = new Date(Date.now() - 180 * 86_400_000).toISOString()

  const [historyRes, workersRes, projectRes] = await Promise.all([
    admin
      .from('tickets')
      .select('id, project_id, description, assigned_worker_id, status, created_at, closed_at')
      .eq('client_id', clientId)
      .eq('project_id', t.project_id)
      .is('deleted_at', null)
      .not('assigned_worker_id', 'is', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(80),
    admin
      .from('workers')
      .select('id, full_name, is_active')
      .eq('client_id', clientId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .limit(100),
    admin
      .from('projects')
      .select('assigned_worker_id')
      .eq('id', t.project_id)
      .eq('client_id', clientId)
      .maybeSingle(),
  ])

  return suggestWorkerForTicket({
    ticket: t,
    history: (historyRes.data || []) as SuggestWorkerTicket[],
    workers: (workersRes.data || []) as { id: string; full_name: string; is_active?: boolean | null }[],
    projectDefaultWorkerId:
      (projectRes.data as { assigned_worker_id?: string | null } | null)?.assigned_worker_id ?? null,
  })
}
