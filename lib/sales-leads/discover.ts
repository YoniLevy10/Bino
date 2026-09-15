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
import { getDiscoveryCities } from '@/lib/sales-leads/discovery-mapping'
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
    city: input?.city ?? getDiscoveryCities()[0] ?? 'תל אביב',
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
    cities?: string[]
  },
): Promise<DiscoveryRunResult> {
  const cities =
    options.cities?.filter(Boolean) ??
    (options.city?.trim()
      ? [options.city.trim()]
      : getDiscoveryCities())
  const cityLabel = cities.length === 1 ? cities[0]! : cities.join(' · ')
  const budget = getDiscoveryTotalBudget()
  const apiCallBudget = getDiscoveryApiCallBudget()
  const segmentSlugs = options.segmentSlugs ?? getSalesSegmentSlugs()
  const perCityBudget = Math.max(80, Math.floor(budget / Math.max(1, cities.length)))
  const perCityApi = Math.max(20, Math.floor(apiCallBudget / Math.max(1, cities.length)))

  if (await hasRunningDiscovery(admin)) {
    return {
      runId: null,
      status: 'busy',
      city: cityLabel,
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
      city: cityLabel,
      status: 'running',
      sources: options.sources ?? ['google_places', 'osm'],
      details: {
        segmentSlugs,
        cities,
        progressPct: 2,
        phase: `מתחיל גילוי · ${cityLabel}`,
        currentSource: null,
      },
    })
    .select('id')
    .maybeSingle()

  if (runErr || !runRow) {
    return {
      runId: null,
      status: 'failed',
      city: cityLabel,
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

  let found = 0
  let created = 0
  let updated = 0
  let skipped = 0
  let errors = 0
  const bySource: DiscoveryRunResult['bySource'] = {}
  const usedSources = new Set<string>()

  const sourceWeight: Record<string, number> = {
    google_places: 0.72,
    osm: 0.28,
  }

  try {
    const hasPlaces = Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim())
    if (!hasPlaces) {
      await writeRunProgress(
        admin,
        runId,
        {
          progressPct: 4,
          phase: 'GOOGLE_PLACES_API_KEY חסר — רץ OSM בלבד על המרכז',
          currentSource: 'osm',
        },
        undefined,
        { segmentSlugs, cities },
      )
    }

    for (let ci = 0; ci < cities.length; ci++) {
      const city = cities[ci]!
      const cityStart = 5 + (ci / cities.length) * 90
      const cityEnd = 5 + ((ci + 1) / cities.length) * 90

      await writeRunProgress(
        admin,
        runId,
        {
          progressPct: clampPct(cityStart),
          phase: `עיר ${ci + 1}/${cities.length}: ${city}`,
          currentSource: null,
          found,
          created,
        },
        { found, created, updated, skipped, errors },
        { segmentSlugs, cities, bySource },
      )

      const adapters = buildAdapters({
        sources: options.sources,
        segmentSlugs,
        city,
        totalBudget: perCityBudget,
        apiCallBudget: perCityApi,
        queryStats,
        onProgressFor: (source) => {
          const weight = sourceWeight[source] ?? 0.5
          const sibling = source === 'google_places' ? 0 : sourceWeight.google_places
          // Map adapter-local progress into this city's slice
          return async (event) => {
            const ratio = event.total > 0 ? event.done / event.total : 0
            const withinCity = (source === 'google_places' ? 0 : sibling) + ratio * weight
            const pct = clampPct(cityStart + withinCity * (cityEnd - cityStart))
            const label = SOURCE_LABEL_HE[source] ?? source
            await writeRunProgress(
              admin,
              runId,
              {
                progressPct: pct,
                phase: `${city} · ${label}${event.label ? ` · ${event.label}` : ''} (${event.done}/${event.total})`,
                currentSource: source,
                found: found + event.kept,
                created,
              },
              { found: found + event.kept, created, updated, skipped, errors },
              { segmentSlugs, cities, bySource },
            )
          }
        },
      })

      if (adapters.length === 0) {
        errors += 1
        continue
      }

      for (const adapter of adapters) {
        usedSources.add(adapter.name)
        const ingest = await ingestFromAdapter(admin, adapter)
        found += ingest.found
        created += ingest.created
        updated += ingest.updated
        skipped += ingest.skipped
        errors += ingest.errors.length

        const prev = bySource[adapter.name] ?? {
          found: 0,
          created: 0,
          updated: 0,
          skipped: 0,
          errors: [] as string[],
        }
        bySource[adapter.name] = {
          found: prev.found + ingest.found,
          created: prev.created + ingest.created,
          updated: prev.updated + ingest.updated,
          skipped: prev.skipped + ingest.skipped,
          errors: [...prev.errors, ...ingest.errors.slice(0, 10)].slice(0, 20),
        }

        if (adapter.name === 'google_places') {
          const places = adapter as PlacesAdapter
          if (places.lastStats?.queryYields?.length) {
            await upsertQueryStats(admin, places.lastStats.queryYields)
          }
        }
      }

      await writeRunProgress(
        admin,
        runId,
        {
          progressPct: clampPct(cityEnd),
          phase: `סיים ${city}`,
          currentSource: null,
          found,
          created,
        },
        { found, created, updated, skipped, errors },
        { segmentSlugs, cities, bySource },
      )
    }

    if (usedSources.size === 0) {
      const msg =
        'אין מקורות זמינים — הגדירו GOOGLE_PLACES_API_KEY או אפשרו OSM'
      await admin
        .from('sales_lead_discovery_runs')
        .update({
          status: 'failed',
          error_message: msg,
          finished_at: new Date().toISOString(),
          details: { progressPct: 100, phase: 'נכשל', segmentSlugs, cities },
        })
        .eq('id', runId)
      return {
        runId,
        status: 'failed',
        city: cityLabel,
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

    await admin
      .from('sales_lead_discovery_runs')
      .update({
        status: 'completed',
        found_count: found,
        created_count: created,
        updated_count: updated,
        skipped_count: skipped,
        error_count: errors,
        sources: [...usedSources],
        details: {
          bySource,
          segmentSlugs,
          cities,
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
      city: cityLabel,
      sources: [...usedSources],
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
          cities,
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
      city: cityLabel,
      sources: [...usedSources],
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
