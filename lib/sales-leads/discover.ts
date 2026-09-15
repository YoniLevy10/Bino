import type { SupabaseClient } from '@supabase/supabase-js'
import {
  GooglePlacesSalesLeadAdapter,
  OsmOverpassSalesLeadAdapter,
} from '@/lib/sales-leads/adapters'
import type { SalesLeadSourceAdapter } from '@/lib/sales-leads/adapters/types'
import {
  getDiscoveryApiCallBudget,
  getDiscoveryTotalBudget,
  getSalesSegmentSlugs,
} from '@/lib/sales-leads/config'
import { getDiscoveryCity } from '@/lib/sales-leads/discovery-mapping'
import {
  hasRunningDiscovery,
  loadQueryStats,
  upsertQueryStats,
} from '@/lib/sales-leads/query-stats-store'
import { ingestFromAdapter } from '@/lib/sales-leads/service'
import type {
  DiscoveryAutoSource,
  DiscoveryRunResult,
  DiscoveryTrigger,
} from '@/lib/sales-leads/types'
import type { GooglePlacesSalesLeadAdapter as PlacesAdapter } from '@/lib/sales-leads/adapters/google-places'

function buildAdapters(input?: {
  sources?: DiscoveryAutoSource[]
  segmentSlugs?: string[]
  city?: string
  totalBudget?: number
  apiCallBudget?: number
  queryStats?: Awaited<ReturnType<typeof loadQueryStats>>
}): SalesLeadSourceAdapter[] {
  const wanted = new Set(input?.sources ?? (['google_places', 'osm'] as DiscoveryAutoSource[]))
  const adapters: SalesLeadSourceAdapter[] = []
  const common = {
    segmentSlugs: input?.segmentSlugs ?? getSalesSegmentSlugs(),
    city: input?.city ?? getDiscoveryCity(),
    totalBudget: input?.totalBudget ?? getDiscoveryTotalBudget(),
    apiCallBudget: input?.apiCallBudget ?? getDiscoveryApiCallBudget(),
    queryStats: input?.queryStats,
  }

  if (wanted.has('google_places') && process.env.GOOGLE_PLACES_API_KEY?.trim()) {
    adapters.push(new GooglePlacesSalesLeadAdapter(common))
  }
  if (wanted.has('osm')) {
    adapters.push(new OsmOverpassSalesLeadAdapter(common))
  }
  return adapters
}

export async function runSalesLeadDiscovery(
  admin: SupabaseClient,
  options: {
    trigger: DiscoveryTrigger
    sources?: DiscoveryAutoSource[]
    segmentSlugs?: string[]
    city?: string
  },
): Promise<DiscoveryRunResult> {
  const city = options.city ?? getDiscoveryCity()
  const budget = getDiscoveryTotalBudget()
  const apiCallBudget = getDiscoveryApiCallBudget()

  if (await hasRunningDiscovery(admin)) {
    return {
      runId: null,
      status: 'busy',
      city,
      sources: [],
      found: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 1,
      budget,
      apiCallBudget,
      errorMessage: 'ריצת גילוי כבר פעילה — נסו שוב בעוד כמה דקות',
      bySource: {},
    }
  }

  const { data: runRow, error: runErr } = await admin
    .from('sales_lead_discovery_runs')
    .insert({
      trigger: options.trigger,
      city,
      status: 'running',
      sources: options.sources ?? ['google_places', 'osm'],
      details: { segmentSlugs: options.segmentSlugs ?? getSalesSegmentSlugs() },
    })
    .select('id')
    .maybeSingle()

  if (runErr || !runRow) {
    return {
      runId: null,
      status: 'failed',
      city,
      sources: [],
      found: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 1,
      budget,
      apiCallBudget,
      errorMessage: runErr?.message ?? 'failed to create discovery run',
      bySource: {},
    }
  }

  const runId = runRow.id as string
  const queryStats = await loadQueryStats(admin)
  const adapters = buildAdapters({
    sources: options.sources,
    segmentSlugs: options.segmentSlugs,
    city,
    totalBudget: budget,
    apiCallBudget,
    queryStats,
  })

  if (adapters.length === 0) {
    const msg =
      'אין מקורות זמינים — הגדירו GOOGLE_PLACES_API_KEY או אפשרו OSM'
    await admin
      .from('sales_lead_discovery_runs')
      .update({
        status: 'failed',
        error_message: msg,
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId)
    return {
      runId,
      status: 'failed',
      city,
      sources: [],
      found: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 1,
      budget,
      apiCallBudget,
      errorMessage: msg,
      bySource: {},
    }
  }

  const bySource: DiscoveryRunResult['bySource'] = {}
  let found = 0
  let created = 0
  let updated = 0
  let skipped = 0
  let errors = 0

  try {
    for (const adapter of adapters) {
      const ingest = await ingestFromAdapter(admin, adapter)
      found += ingest.found
      created += ingest.created
      updated += ingest.updated
      skipped += ingest.skipped
      errors += ingest.errors.length
      bySource[adapter.name] = {
        found: ingest.found,
        created: ingest.created,
        updated: ingest.updated,
        skipped: ingest.skipped,
        errors: ingest.errors.slice(0, 20),
      }

      if (adapter.name === 'google_places') {
        const places = adapter as PlacesAdapter
        if (places.lastStats?.queryYields?.length) {
          await upsertQueryStats(admin, places.lastStats.queryYields)
        }
      }
    }

    await admin
      .from('sales_lead_discovery_runs')
      .update({
        status: 'completed',
        found_count: found,
        created_count: created,
        updated_count: updated,
        skipped_count: skipped,
        error_count: errors,
        sources: adapters.map((a) => a.name),
        details: { bySource },
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId)

    return {
      runId,
      status: 'completed',
      city,
      sources: adapters.map((a) => a.name),
      found,
      created,
      updated,
      skipped,
      errors,
      budget,
      apiCallBudget,
      bySource,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'discovery failed'
    await admin
      .from('sales_lead_discovery_runs')
      .update({
        status: 'failed',
        error_message: message,
        found_count: found,
        created_count: created,
        updated_count: updated,
        skipped_count: skipped,
        error_count: errors + 1,
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId)

    return {
      runId,
      status: 'failed',
      city,
      sources: adapters.map((a) => a.name),
      found,
      created,
      updated,
      skipped,
      errors: errors + 1,
      budget,
      apiCallBudget,
      errorMessage: message,
      bySource,
    }
  }
}
