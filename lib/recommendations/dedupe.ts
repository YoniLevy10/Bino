import type { RecommendationType } from './types'

export function buildDedupeKey(
  type: RecommendationType,
  entityId: string,
  extra?: string | null
): string {
  const base = `${type}:${entityId}`
  if (!extra?.trim()) return base
  return `${base}:${extra.trim().toLowerCase()}`
}
