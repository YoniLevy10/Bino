import { URGENCY_RANK, type ManagementRecommendationRow } from './types'

/** Sort: urgency → older detection first → updated_at. */
export function rankRecommendations<T extends Pick<ManagementRecommendationRow, 'urgency' | 'detected_at' | 'updated_at'>>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) => {
    const ua = URGENCY_RANK[a.urgency] ?? 99
    const ub = URGENCY_RANK[b.urgency] ?? 99
    if (ua !== ub) return ua - ub
    const da = new Date(a.detected_at).getTime()
    const db = new Date(b.detected_at).getTime()
    if (da !== db) return da - db
    return new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
  })
}
