import type { SupabaseClient } from '@supabase/supabase-js'
import { getClientEnabledAddonKeys, PAID_ADDON_KEYS } from '@/lib/paid-addons'
import type { ManagementRecommendationRow, RecommendationAction, RecommendationType } from './types'

const TYPE_REQUIRES_ADDON: Partial<Record<RecommendationType, string>> = {
  collections_drafts: PAID_ADDON_KEYS.collections,
  collections_send_failed: PAID_ADDON_KEYS.collections,
  collections_sent_unpaid: PAID_ADDON_KEYS.collections,
}

export async function loadEnabledAddonKeys(
  admin: SupabaseClient,
  clientId: string
): Promise<Set<string>> {
  try {
    return await getClientEnabledAddonKeys(admin, clientId)
  } catch {
    return new Set()
  }
}

export function recommendationAllowedForAddons(
  type: string,
  enabledAddons: Set<string>
): boolean {
  const required = TYPE_REQUIRES_ADDON[type as RecommendationType]
  if (!required) return true
  return enabledAddons.has(required)
}

export function filterActionsByAddons(
  actions: RecommendationAction[],
  enabledAddons: Set<string>
): RecommendationAction[] {
  return actions.filter((a) => {
    if (!a.requiresAddon) return true
    return enabledAddons.has(a.requiresAddon)
  })
}

export function parseActions(raw: unknown): RecommendationAction[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((a): a is RecommendationAction => {
    return !!a && typeof a === 'object' && typeof (a as RecommendationAction).id === 'string'
  })
}

export function presentRecommendation(
  row: ManagementRecommendationRow,
  enabledAddons: Set<string>
): ManagementRecommendationRow | null {
  if (!recommendationAllowedForAddons(row.recommendation_type, enabledAddons)) {
    return null
  }
  const actions = filterActionsByAddons(parseActions(row.actions), enabledAddons)
  let primaryHref = row.primary_action_href
  let primaryAction = row.primary_action
  if (primaryAction) {
    const primary = actions.find((a) => a.id === primaryAction || a.label === primaryAction)
    if (primary?.requiresAddon && !enabledAddons.has(primary.requiresAddon)) {
      primaryAction = actions[0]?.id ?? null
      primaryHref = actions[0]?.href ?? null
    }
  }
  return {
    ...row,
    actions,
    primary_action: primaryAction,
    primary_action_href: primaryHref,
  }
}
