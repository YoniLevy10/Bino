import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import type { OpsBriefing } from '@/lib/ops-context/synthesize-briefing'
import type { ManagementRecommendationRow } from '@/lib/recommendations/types'

/**
 * Background read. Middleware can queue several shell calls for well over the
 * default 10s fetch budget; the bell must wait that out and never throw.
 */
const RECOMMENDATIONS_READ_TIMEOUT_MS = 25_000
const FRESH_MS = 15_000

export type RecommendationsListPayload = {
  recommendations: ManagementRecommendationRow[]
  briefing: OpsBriefing | null
}

let inflight: Promise<RecommendationsListPayload | null> | null = null
let fresh: { at: number; data: RecommendationsListPayload } | null = null

/** Shared by the header bell and the dashboard card so they do not double-fetch. */
export function loadRecommendationsClient(): Promise<RecommendationsListPayload | null> {
  if (fresh && Date.now() - fresh.at < FRESH_MS) return Promise.resolve(fresh.data)
  if (!inflight) {
    inflight = fetchRecommendationsList().finally(() => {
      inflight = null
    })
  }
  return inflight
}

async function fetchRecommendationsList(): Promise<RecommendationsListPayload | null> {
  try {
    const res = await fetchWithTimeout(
      '/api/recommendations?limit=30',
      {},
      RECOMMENDATIONS_READ_TIMEOUT_MS
    )
    if (!res.ok) return null
    const body = (await res.json()) as {
      recommendations?: ManagementRecommendationRow[]
      briefing?: OpsBriefing | null
    }
    const data: RecommendationsListPayload = {
      recommendations: body.recommendations ?? [],
      briefing: body.briefing ?? null,
    }
    fresh = { at: Date.now(), data }
    return data
  } catch {
    return null
  }
}
