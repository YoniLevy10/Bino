import type { SupabaseClient } from '@supabase/supabase-js'
import {
  GooglePlacesSalesLeadAdapter,
  OsmOverpassSalesLeadAdapter,
} from '@/lib/sales-leads/adapters'
import type {
  AdapterProgressCallback,
  SalesLeadSourceAdapter,
} from '@/lib/sales-leads/adapters/types'
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
  DiscoveryProgress,
  DiscoveryRunResult,
  DiscoveryTrigger,
} from '@/lib/sales-leads/types'
import type { GooglePlacesSalesLeadAdapter as PlacesAdapter } from '@/lib/sales-leads/adapters/google-places'

const SOURCE_LABEL_HE: Record<string, string> = {
  google_places: 'Google Places',
  osm: 'OpenStreetMap',
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(99, Math.round(n)))
}

async function writeRunProgress(
  admin: SupabaseClient,
  runId: string,
  progress: DiscoveryProgress,
  counts?: { found?: number; created?: number; updated?: number; skipped?: number; errors?: number },
  extraDetails?: Record<string, unknown>,
): Promise<void> {
  const details = {
    ...(extraDetails ?? {}),
    progressPct: progress.progressPct,
    phase: progress.phase,
    currentSource: progress.currentSource ?? null,
    found: progress.found ?? counts?.found ?? 0,
    created: progress.created ?? counts?.created ?? 0,
  }
  await admin
    .from('sales_lead_discovery_runs')
    .update({
      found_count: counts?.found ?? progress.found ?? 0,
      created_count: counts?.created ?? progress.created ?? 0,
      updated_count: counts?.updated ?? 0,
      skipped_count: counts?.skipped ?? 0,
      error_count: counts?.errors ?? 0,
      details,
    })
    .eq('id', runId)
}

function buildAdapters(input?: {
  sources?: DiscoveryAutoSource[]
  segmentSlugs?: string[]
  city?: string
  totalBudget?: number
  apiCallBudget?: number
  queryStats?: Awaited<ReturnType<typeof loadQueryStats>>
  onProgressFor?: (source: DiscoveryAutoSource) => AdapterProgressCallback | undefined
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
    adapters.push(
      new GooglePlacesSalesLeadAdapter({
        ...common,
        onProgress: input?.onProgressFor?.('google_places'),
      }),
    )
  }
  if (wanted.has('osm')) {
    adapters.push(
      new OsmOverpassSalesLeadAdapter({
        ...common,
        onProgress: input?.onProgressFor?.('osm'),
      }),
    )
  }
  return adapters
}

export async function getLatestDiscoveryProgress(
  admin: SupabaseClient,
): Promise<{
  runId: string | null
  status: string | null
  city: string | null
  progress: DiscoveryProgress | null
  found: number
  created: number
  errorMessage: string | null
}> {
  const { data } = await admin
    .from('sales_lead_discovery_runs')
    .select('id, status, city, found_count, created_count, error_message, details')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) {
    return {
      runId: null,
      status: null,
      city: null,
      progress: null,
      found: 0,
      created: 0,
      errorMessage: null,
    }
  }

  const details = (data.details ?? {}) as Record<string, unknown>
  const progressPct =
    typeof details.progressPct === 'number'
      ? details.progressPct
      : data.status === 'completed'
        ? 100
        : data.status === 'running'
          ? 5
          : 0
  const phase =
    typeof details.phase === 'string'
      ? details.phase
      : data.status === 'completed'
        ? 'הושלם'
        : data.status === 'failed'
          ? 'נכשל'
          : data.status === 'running'
            ? 'רץ…'
            : ''

  return {
    runId: data.id as string,
    status: data.status as string,
    city: data.city as string,
    progress: {
      progressPct: data.status === 'completed' ? 100 : clampPct(progressPct),
      phase,
      currentSource: typeof details.currentSource === 'string' ? details.currentSource : null,
      found: Number(data.found_count ?? 0),
      created: Number(data.created_count ?? 0),
    },
    found: Number(data.found_count ?? 0),
    created: Number(data.created_count ?? 0),
    errorMessage: (data.error_message as string | null) ?? null,
  }
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
  const segmentSlugs = options.segmentSlugs ?? getSalesSegmentSlugs()

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
      details: {
        segmentSlugs,
        progressPct: 2,
        phase: 'מתחיל גילוי…',
        currentSource: null,
      },
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

  const sourceRanges: Record<string, { start: number; end: number }> = {
    google_places: { start: 8, end: 70 },
    osm: { start: 70, end: 94 },
  }

  let found = 0
  let created = 0
  let updated = 0
  let skipped = 0
  let errors = 0
  const bySource: DiscoveryRunResult['bySource'] = {}

  const adapters = buildAdapters({
    sources: options.sources,
    segmentSlugs,
    city,
    totalBudget: budget,
    apiCallBudget,
    queryStats,
    onProgressFor: (source) => {
      const range = sourceRanges[source] ?? { start: 10, end: 90 }
      return async (event) => {
        const ratio = event.total > 0 ? event.done / event.total : 0
        const pct = clampPct(range.start + ratio * (range.end - range.start))
        const label = SOURCE_LABEL_HE[source] ?? source
        await writeRunProgress(
          admin,
          runId,
          {
            progressPct: pct,
            phase: `סורק ${label}${event.label ? ` · ${event.label}` : ''} (${event.done}/${event.total})`,
            currentSource: source,
            found: found + event.kept,
            created,
          },
          { found: found + event.kept, created, updated, skipped, errors },
          { segmentSlugs, bySource },
        )
      }
    },
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
        details: { progressPct: 100, phase: 'נכשל', segmentSlugs },
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

  // Recompute ranges if only one source is active
  if (adapters.length === 1) {
    sourceRanges[adapters[0].name] = { start: 8, end: 94 }
  }

  try {
    await writeRunProgress(
      admin,
      runId,
      { progressPct: 5, phase: 'מכין מקורות…', currentSource: null },
      undefined,
      { segmentSlugs },
    )

    for (let i = 0; i < adapters.length; i++) {
      const adapter = adapters[i]
      const range = sourceRanges[adapter.name] ?? {
        start: 8 + (i / adapters.length) * 86,
        end: 8 + ((i + 1) / adapters.length) * 86,
      }
      await writeRunProgress(
        admin,
        runId,
        {
          progressPct: clampPct(range.start),
          phase: `מתחיל ${SOURCE_LABEL_HE[adapter.name] ?? adapter.name}…`,
          currentSource: adapter.name,
          found,
          created,
        },
        { found, created, updated, skipped, errors },
        { segmentSlugs, bySource },
      )

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

      await writeRunProgress(
        admin,
        runId,
        {
          progressPct: clampPct(range.end),
          phase: `סיים ${SOURCE_LABEL_HE[adapter.name] ?? adapter.name}`,
          currentSource: adapter.name,
          found,
          created,
        },
        { found, created, updated, skipped, errors },
        { segmentSlugs, bySource },
      )
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
        details: {
          bySource,
          segmentSlugs,
          progressPct: 100,
          phase: 'הושלם',
          currentSource: null,
          found,
          created,
        },
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
        details: {
          bySource,
          segmentSlugs,
          progressPct: 100,
          phase: 'נכשל',
          currentSource: null,
          found,
          created,
        },
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
