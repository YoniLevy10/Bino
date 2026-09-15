import type { SupabaseClient } from '@supabase/supabase-js'
import { DISCOVERY_STALE_RUN_MS } from '@/lib/sales-leads/config'
import type { QueryStatRow, QueryYieldUpdate } from '@/lib/sales-leads/query-queue'
import { computeYieldScore } from '@/lib/sales-leads/query-queue'

/**
 * Serverless kills leave status=running forever and block all new discovery.
 * Fail any running row older than DISCOVERY_STALE_RUN_MS.
 */
export async function recoverStaleDiscoveryRuns(
  admin: SupabaseClient,
  olderThanMs = DISCOVERY_STALE_RUN_MS,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString()
  const { data, error } = await admin
    .from('sales_lead_discovery_runs')
    .update({
      status: 'failed',
      error_message: 'ריצה נתקעה (timeout) — שוחרר אוטומטית',
      finished_at: new Date().toISOString(),
      details: {
        progressPct: 100,
        phase: 'נכשל — timeout',
        recoveredStale: true,
      },
    })
    .eq('status', 'running')
    .lt('started_at', cutoff)
    .select('id')

  if (error) {
    console.error('[sales-leads.recoverStale]', error.message)
    return 0
  }
  return data?.length ?? 0
}

export async function hasRunningDiscovery(admin: SupabaseClient): Promise<boolean> {
  await recoverStaleDiscoveryRuns(admin)
  const { data } = await admin
    .from('sales_lead_discovery_runs')
    .select('id')
    .eq('status', 'running')
    .limit(1)
  return Boolean(data?.length)
}

export async function loadQueryStats(admin: SupabaseClient): Promise<QueryStatRow[]> {
  const { data } = await admin
    .from('sales_lead_query_stats')
    .select(
      'query_key, yield_score, suitable_count, unique_new_count, raw_count, last_run_at',
    )
    .limit(2000)
  return (data ?? []) as QueryStatRow[]
}

export async function upsertQueryStats(
  admin: SupabaseClient,
  yields: QueryYieldUpdate[],
): Promise<void> {
  if (yields.length === 0) return
  const now = new Date().toISOString()
  const rows = yields.map((y) => ({
    query_key: y.queryKey,
    city: y.city,
    source_name: y.sourceName,
    raw_count: y.raw,
    unique_new_count: y.uniqueNew,
    suitable_count: y.suitable,
    needs_review_count: y.needsReview,
    unsuitable_count: y.unsuitable,
    api_calls: y.apiCalls,
    yield_score: computeYieldScore(y),
    last_run_at: now,
    updated_at: now,
  }))

  await admin.from('sales_lead_query_stats').upsert(rows, { onConflict: 'query_key' })
}
