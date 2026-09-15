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
  DISCOVERY_OSM_WALL_MS,
  DISCOVERY_SOFT_DEADLINE_MS,
  getDiscoveryApiCallBudget,
  getDiscoveryTotalBudget,
  getGooglePlacesApiKey,
  getSalesSegmentSlugs,
  isGooglePlacesConfigured,
  shouldIncludeOsmWithPlaces,
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

const PLACES_KEY_MISSING_HE =
  'חסר מפתח Google Places — הגדירו GOOGLE_PLACES_API_KEY (או GOOGLE_MAPS_API_KEY) ב-Vercel והפעילו Places API (New)'

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
  osmDeadlineMs?: number
  onProgressFor?: (source: DiscoveryAutoSource) => AdapterProgressCallback | undefined
}): SalesLeadSourceAdapter[] {
  const wanted = new Set(input?.sources ?? (['google_places', 'osm'] as DiscoveryAutoSource[]))
  const adapters: SalesLeadSourceAdapter[] = []
  const placesKey = getGooglePlacesApiKey()
  const common = {
    segmentSlugs: input?.segmentSlugs ?? getSalesSegmentSlugs(),
    city: input?.city ?? getDiscoveryCities()[0] ?? 'תל אביב',
    totalBudget: input?.totalBudget ?? getDiscoveryTotalBudget(),
    apiCallBudget: input?.apiCallBudget ?? getDiscoveryApiCallBudget(),
    queryStats: input?.queryStats,
  }

  if (wanted.has('google_places') && placesKey) {
    adapters.push(
      new GooglePlacesSalesLeadAdapter({
        ...common,
        apiKey: placesKey,
        onProgress: input?.onProgressFor?.('google_places'),
      }),
    )
  }

  // OSM only when requested in `sources` AND (no Places key, or explicit include flag / osm-only).
  if (wanted.has('osm')) {
    const osmOnly = input?.sources?.length === 1 && input.sources[0] === 'osm'
    const allowOsm = !placesKey || shouldIncludeOsmWithPlaces() || osmOnly
    if (allowOsm) {
      adapters.push(
        new OsmOverpassSalesLeadAdapter({
          ...common,
          deadlineMs: input?.osmDeadlineMs,
          onProgress: input?.onProgressFor?.('osm'),
        }),
      )
    }
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
  placesConfigured: boolean
}> {
  // Opportunistic unlock so UI/status never stay stuck behind a dead lock.
  await hasRunningDiscovery(admin)

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
      placesConfigured: isGooglePlacesConfigured(),
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
    placesConfigured: isGooglePlacesConfigured(),
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
  const startedAt = Date.now()
  const softDeadline = startedAt + DISCOVERY_SOFT_DEADLINE_MS
  const placesKey = getGooglePlacesApiKey()
  const placesConfigured = Boolean(placesKey)

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

  const osmOnly =
    options.sources?.length === 1 && options.sources[0] === 'osm'
  if (!placesConfigured && !osmOnly) {
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
      errorMessage: PLACES_KEY_MISSING_HE,
      bySource: {},
    }
  }

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

  const defaultSources: DiscoveryAutoSource[] = placesConfigured
    ? shouldIncludeOsmWithPlaces()
      ? ['google_places', 'osm']
      : ['google_places']
    : ['osm']
  const runSources = options.sources ?? defaultSources

  const { data: runRow, error: runErr } = await admin
    .from('sales_lead_discovery_runs')
    .insert({
      trigger: options.trigger,
      city: cityLabel,
      status: 'running',
      sources: runSources,
      details: {
        segmentSlugs,
        cities,
        progressPct: 2,
        phase: placesConfigured
          ? `מתחיל גילוי · ${cityLabel}`
          : `OSM בלבד · ${cityLabel}`,
        currentSource: null,
        placesConfigured,
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
  let stoppedEarly: string | null = null

  const sourceWeight: Record<string, number> = {
    google_places: placesConfigured && !shouldIncludeOsmWithPlaces() ? 1 : 0.85,
    osm: placesConfigured && !shouldIncludeOsmWithPlaces() ? 0 : 0.15,
  }

  try {
    for (let ci = 0; ci < cities.length; ci++) {
      if (Date.now() >= softDeadline) {
        stoppedEarly = 'soft_deadline'
        break
      }

      const city = cities[ci]!
      const cityStart = 5 + (ci / cities.length) * 90
      const cityEnd = 5 + ((ci + 1) / cities.length) * 90
      const remainingMs = Math.max(5_000, softDeadline - Date.now())
      const osmDeadlineMs = Math.min(
        Date.now() + Math.min(DISCOVERY_OSM_WALL_MS, Math.floor(remainingMs * 0.35)),
        softDeadline,
      )

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
        { segmentSlugs, cities, bySource, placesConfigured },
      )

      const adapters = buildAdapters({
        sources: runSources,
        segmentSlugs,
        city,
        totalBudget: perCityBudget,
        apiCallBudget: perCityApi,
        queryStats,
        osmDeadlineMs,
        onProgressFor: (source) => {
          const weight = sourceWeight[source] ?? 0.5
          const sibling =
            source === 'google_places' ? 0 : sourceWeight.google_places ?? 0
          return async (event) => {
            const ratio = event.total > 0 ? event.done / event.total : 0
            const withinCity =
              (source === 'google_places' ? 0 : sibling) + ratio * weight
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
              { segmentSlugs, cities, bySource, placesConfigured },
            )
          }
        },
      })

      if (adapters.length === 0) {
        errors += 1
        continue
      }

      for (const adapter of adapters) {
        if (Date.now() >= softDeadline) {
          stoppedEarly = 'soft_deadline'
          break
        }
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
          if (places.lastStats?.searchErrors?.length) {
            bySource.google_places!.errors = [
              ...bySource.google_places!.errors,
              ...places.lastStats.searchErrors.slice(0, 10),
            ].slice(0, 20)
            errors += places.lastStats.searchErrors.length
          }
          if (places.lastStats?.queryYields?.length) {
            await upsertQueryStats(admin, places.lastStats.queryYields)
          }
        }
      }

      if (stoppedEarly) break

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
        { segmentSlugs, cities, bySource, placesConfigured, stoppedEarly },
      )
    }

    if (usedSources.size === 0) {
      const msg = placesConfigured
        ? 'אין מקורות זמינים לריצה'
        : PLACES_KEY_MISSING_HE
      await admin
        .from('sales_lead_discovery_runs')
        .update({
          status: 'failed',
          error_message: msg,
          finished_at: new Date().toISOString(),
          details: {
            progressPct: 100,
            phase: 'נכשל',
            segmentSlugs,
            cities,
            placesConfigured,
          },
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

    const placesStats = bySource.google_places
    const placesHardFail =
      placesConfigured &&
      usedSources.has('google_places') &&
      found === 0 &&
      (placesStats?.errors.length ?? 0) > 0 &&
      (placesStats?.found ?? 0) === 0

    if (placesHardFail) {
      const msg = `Google Places נכשל בכל השאילתות — בדקו מפתח API, חיוב, והפעלת Places API (New). ${placesStats?.errors[0] ?? ''}`
      await admin
        .from('sales_lead_discovery_runs')
        .update({
          status: 'failed',
          error_message: msg.slice(0, 500),
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
            phase: 'נכשל',
            placesConfigured,
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
        errorMessage: msg.slice(0, 500),
        bySource,
      }
    }

    const phaseDone = stoppedEarly
      ? `הושלם חלקית (תקציב זמן) · נמצאו ${found}`
      : 'הושלם'

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
          phase: phaseDone,
          currentSource: null,
          found,
          created,
          placesConfigured,
          stoppedEarly,
          elapsedMs: Date.now() - startedAt,
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
      ...(stoppedEarly
        ? { errorMessage: 'הושלם חלקית — נעצר לפני timeout של Vercel' }
        : {}),
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
          placesConfigured,
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
