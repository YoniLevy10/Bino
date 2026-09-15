import type {
  AdapterProgressCallback,
  SalesLeadSourceAdapter,
} from '@/lib/sales-leads/adapters/types'
import type { SalesLeadSourceRecord } from '@/lib/sales-leads/types'
import {
  getCityGeoProfile,
  getDiscoveryCity,
  getDiscoveryMappingsForSlugs,
  placesSearchJobsFor,
  type PlacesSearchJob,
} from '@/lib/sales-leads/discovery-mapping'
import {
  getDiscoveryApiCallBudget,
  getDiscoveryPerSegmentCap,
  getDiscoveryTotalBudget,
  getGooglePlacesApiKey,
  getSalesSegmentSlugs,
} from '@/lib/sales-leads/config'
import { assessBuyerFit, estimateBuildingsFromSignals, shouldKeepDiscoveredLead } from '@/lib/sales-leads/fit-score'
import {
  computeYieldScore,
  selectJobsForBudget,
  type QueryStatRow,
  type QueryYieldUpdate,
} from '@/lib/sales-leads/query-queue'
import { fetchWithTimeout } from '@/lib/fetch-timeout'

type PlacesTextSearchResult = {
  places?: Array<{
    id?: string
    name?: string
    formattedAddress?: string
    nationalPhoneNumber?: string
    internationalPhoneNumber?: string
    websiteUri?: string
    googleMapsUri?: string
    types?: string[]
    rating?: number
    userRatingCount?: number
    regularOpeningHours?: { weekdayDescriptions?: string[] }
    displayName?: { text?: string }
  }>
  nextPageToken?: string
}

const PLACES_PAGE_MAX = 20
const PLACES_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.googleMapsUri',
  'places.types',
  'places.rating',
  'places.userRatingCount',
  'places.regularOpeningHours',
  'nextPageToken',
].join(',')

export type GooglePlacesFetchStats = {
  rawFetched: number
  uniquePlaces: number
  rejectedFilter: number
  kept: number
  suitable: number
  needsReview: number
  searchCalls: number
  searchErrors: string[]
  stopReason: string | null
  queryYields: QueryYieldUpdate[]
}

export type GooglePlacesAdapterOptions = {
  apiKey?: string
  segmentSlugs?: string[]
  city?: string
  totalBudget?: number
  apiCallBudget?: number
  perSegmentLimit?: number
  queryStats?: QueryStatRow[]
  onProgress?: AdapterProgressCallback
}

export class GooglePlacesSalesLeadAdapter implements SalesLeadSourceAdapter {
  readonly name = 'google_places'

  private readonly apiKey: string
  private readonly city: string
  private readonly totalBudget: number
  private readonly apiCallBudget: number
  private readonly perSegmentLimit: number
  private readonly queryStats: QueryStatRow[]
  private readonly mappings: ReturnType<typeof getDiscoveryMappingsForSlugs>
  private readonly onProgress?: AdapterProgressCallback
  lastStats: GooglePlacesFetchStats = emptyStats()

  constructor(options: GooglePlacesAdapterOptions = {}) {
    const key = options.apiKey ?? getGooglePlacesApiKey()
    if (!key) throw new Error('GOOGLE_PLACES_API_KEY is missing')
    this.apiKey = key
    this.city = options.city ?? getDiscoveryCity()
    this.mappings = getDiscoveryMappingsForSlugs(
      options.segmentSlugs ?? getSalesSegmentSlugs(),
    )
    this.totalBudget = Math.max(1, options.totalBudget ?? getDiscoveryTotalBudget())
    this.apiCallBudget = Math.max(1, options.apiCallBudget ?? getDiscoveryApiCallBudget())
    const defaultPer = Math.ceil(this.totalBudget / Math.max(1, this.mappings.length))
    this.perSegmentLimit = Math.min(
      options.perSegmentLimit ?? defaultPer,
      getDiscoveryPerSegmentCap(),
    )
    this.queryStats = options.queryStats ?? []
    this.onProgress = options.onProgress
  }

  async fetchRecords(): Promise<SalesLeadSourceRecord[]> {
    const out: SalesLeadSourceRecord[] = []
    const seen = new Set<string>()
    const stats = emptyStats()
    const yieldMap = new Map<string, QueryYieldUpdate>()
    const profile = getCityGeoProfile(this.city)

    const allJobs: PlacesSearchJob[] = []
    for (const mapping of this.mappings) {
      allJobs.push(...placesSearchJobsFor(mapping, this.city, profile.areas))
    }

    const jobBudget = Math.max(1, Math.floor(this.apiCallBudget * 0.7))
    const selected = selectJobsForBudget(allJobs, this.queryStats, jobBudget)
    const keptBySegment = new Map<string, number>()
    let jobsDone = 0

    for (const job of selected) {
      if (stats.searchCalls >= this.apiCallBudget) {
        stats.stopReason = 'api_call_budget'
        break
      }
      if (stats.rawFetched >= this.totalBudget) {
        stats.stopReason = 'raw_result_budget'
        break
      }
      if ((keptBySegment.get(job.segmentSlug) ?? 0) >= this.perSegmentLimit) continue

      const yieldRow = yieldMap.get(job.queryKey) ?? {
        queryKey: job.queryKey,
        city: this.city,
        sourceName: 'google_places',
        raw: 0,
        uniqueNew: 0,
        suitable: 0,
        needsReview: 0,
        unsuitable: 0,
        apiCalls: 0,
      }

      let pageToken: string | undefined
      let pages = 0
      let newOnLastPage = 0

      try {
        do {
          if (stats.searchCalls >= this.apiCallBudget) break
          const { places, nextPageToken } = await this.textSearch(job, pageToken)
          stats.searchCalls += 1
          yieldRow.apiCalls += 1
          pages += 1
          stats.rawFetched += places.length
          yieldRow.raw += places.length
          newOnLastPage = 0

          for (const place of places) {
            const placeId = place.id?.trim()
            if (!placeId || seen.has(placeId)) continue
            seen.add(placeId)
            stats.uniquePlaces += 1
            newOnLastPage += 1
            yieldRow.uniqueNew += 1

            const name = place.displayName?.text?.trim() || place.name?.trim() || job.textQuery
            const phone =
              place.nationalPhoneNumber?.trim() ||
              place.internationalPhoneNumber?.trim() ||
              null
            const website = place.websiteUri?.trim() || null
            const address = place.formattedAddress?.trim() || null
            const placeTypes = place.types ?? []
            const reviewCount = place.userRatingCount ?? null
            const rating = place.rating ?? null

            const assessment = assessBuyerFit({
              name,
              businessName: name,
              phone,
              websiteUrl: website,
              address,
              placeTypes,
              segmentSlug: job.segmentSlug,
              searchAreaHint: job.area.labelHe,
              reviewCount,
              rating,
            })

            if (assessment.fitClass === 'unsuitable') {
              stats.rejectedFilter += 1
              yieldRow.unsuitable += 1
              continue
            }

            if (
              !shouldKeepDiscoveredLead({
                name,
                businessName: name,
                phone,
                websiteUrl: website,
                address,
                placeTypes,
                segmentSlug: job.segmentSlug,
                searchAreaHint: job.area.labelHe,
                reviewCount,
                rating,
              })
            ) {
              stats.rejectedFilter += 1
              continue
            }

            if (assessment.fitClass === 'suitable') {
              stats.suitable += 1
              yieldRow.suitable += 1
            } else if (assessment.fitClass === 'needs_review') {
              stats.needsReview += 1
              yieldRow.needsReview += 1
            }

            const estimatedBuildings = estimateBuildingsFromSignals({
              name,
              businessName: name,
              reviewCount,
              segmentSlug: job.segmentSlug,
            })

            out.push({
              name,
              businessName: name,
              phone,
              whatsappPhone: assessment.contactability === 'mobile' ? phone : null,
              city: this.city,
              searchCity: this.city,
              businessAddress: address,
              segmentSlug: job.segmentSlug,
              sourceName: 'google_places',
              sourceUrl: place.googleMapsUri || website || null,
              websiteUrl: website,
              externalId: placeId,
              notes: address ? `כתובת: ${address}` : null,
              outreachAngle: job.outreachAngleHe,
              fitScore: assessment.score,
              fitClass: assessment.fitClass,
              fitConfidence: assessment.confidence,
              fitReasons: assessment.reasons,
              contactability: assessment.contactability,
              estimatedBuildings,
              estimatedMrrIls: assessment.estimatedMrrIls,
              queryKey: job.queryKey,
              placeTypes,
              reviewCount,
              rating,
              openingHours: place.regularOpeningHours?.weekdayDescriptions ?? null,
            })
            stats.kept += 1
            keptBySegment.set(
              job.segmentSlug,
              (keptBySegment.get(job.segmentSlug) ?? 0) + 1,
            )
          }

          pageToken = nextPageToken
          if (pageToken && newOnLastPage === 0) break
          if (pages >= 3) break
        } while (pageToken)
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Places search failed'
        stats.searchErrors.push(`${job.queryKey}: ${message}`)
      }

      yieldMap.set(job.queryKey, yieldRow)
      jobsDone += 1
      if (this.onProgress) {
        await this.onProgress({
          done: jobsDone,
          total: Math.max(1, selected.length),
          kept: stats.kept,
          label: job.textQuery,
        })
      }
    }

    stats.queryYields = [...yieldMap.values()].map((y) => ({
      ...y,
      ...( { yieldScore: computeYieldScore(y) } as { yieldScore?: number }),
    }))
    this.lastStats = stats
    out.sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0))
    return out
  }

  private async textSearch(
    job: PlacesSearchJob,
    pageToken?: string,
  ): Promise<{
    places: NonNullable<PlacesTextSearchResult['places']>
    nextPageToken?: string
  }> {
    const body: Record<string, unknown> = {
      textQuery: job.textQuery,
      languageCode: job.languageCode,
      regionCode: 'IL',
      pageSize: PLACES_PAGE_MAX,
      locationBias: {
        circle: {
          center: { latitude: job.area.lat, longitude: job.area.lng },
          radius: job.area.radiusMeters,
        },
      },
    }
    if (pageToken) body.pageToken = pageToken

    const res = await fetchWithTimeout(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': PLACES_FIELD_MASK,
        },
        body: JSON.stringify(body),
      },
      20_000,
    )

    if (!res) throw new Error('Google Places search timeout')
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      throw new Error(`Google Places search failed (${res.status}): ${errBody.slice(0, 300)}`)
    }

    const json = (await res.json()) as PlacesTextSearchResult
    return { places: json.places ?? [], nextPageToken: json.nextPageToken }
  }
}

function emptyStats(): GooglePlacesFetchStats {
  return {
    rawFetched: 0,
    uniquePlaces: 0,
    rejectedFilter: 0,
    kept: 0,
    suitable: 0,
    needsReview: 0,
    searchCalls: 0,
    searchErrors: [],
    stopReason: null,
    queryYields: [],
  }
}
