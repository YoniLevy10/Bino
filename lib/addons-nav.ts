import { isNavFeatureEnabled, REQUIRED_NAV_FEATURE_IDS } from '@/lib/client-nav-features'
import { DEFAULT_SIDEBAR_NAV_ORDER, type SidebarNavItem, type SidebarNavItemId } from '@/lib/sidebar-nav'

export const LEVY_TECH_BRAND = 'Levy Tech'

export const ADDONS_NAV_ITEM: SidebarNavItem = {
  id: 'addons',
  href: '/addons',
  label: 'תוספים',
  icon: 'lock',
  locked: true,
}

/** Generic labels — do not reveal which product feature is locked. */
export function getGenericAddonSlotLabels(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `תוסף ${i + 1}`)
}

export function getLockedAddonsCount(
  enabledFeatures: SidebarNavItemId[] | null | undefined
): number {
  if (!enabledFeatures || enabledFeatures.length === 0) return 0
  return DEFAULT_SIDEBAR_NAV_ORDER.filter(
    (id) => !REQUIRED_NAV_FEATURE_IDS.includes(id) && !isNavFeatureEnabled(enabledFeatures, id)
  ).length
}

export function appendAddonsNavIfNeeded(
  items: SidebarNavItem[],
  enabledFeatures: SidebarNavItemId[] | null | undefined
): SidebarNavItem[] {
  if (getLockedAddonsCount(enabledFeatures) === 0) return items
  if (items.some((item) => item.id === 'addons')) return items
  return [...items, ADDONS_NAV_ITEM]
}
