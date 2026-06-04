import { isNavFeatureEnabled, PREMIUM_NAV_FEATURE_IDS } from '@/lib/client-nav-features'
import type { SidebarNavItem, SidebarNavItemId } from '@/lib/sidebar-nav'

export const BAMAKOR_BRAND = 'במקור'
/** @deprecated use BAMAKOR_BRAND */
export const LEVY_TECH_BRAND = BAMAKOR_BRAND

export const ADDONS_NAV_ITEM: SidebarNavItem = {
  id: 'addons',
  href: '/addons',
  label: 'תוספים',
  icon: 'grid',
  locked: true,
}

export function getLockedAddonsCount(
  enabledFeatures: SidebarNavItemId[] | null | undefined
): number {
  if (!enabledFeatures?.length) return 0
  return PREMIUM_NAV_FEATURE_IDS.filter((id) => !isNavFeatureEnabled(enabledFeatures, id)).length
}

export function appendAddonsNavIfNeeded(
  items: SidebarNavItem[],
  enabledFeatures: SidebarNavItemId[] | null | undefined
): SidebarNavItem[] {
  if (getLockedAddonsCount(enabledFeatures) === 0) return items
  if (items.some((item) => item.id === 'addons')) return items
  return [...items, ADDONS_NAV_ITEM]
}
