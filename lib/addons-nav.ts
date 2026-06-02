import { getLockedPaidAddonsCount } from '@/lib/paid-addons-catalog'
import type { SidebarNavItem, SidebarNavItemId } from '@/lib/sidebar-nav'

export const LEVY_TECH_BRAND = 'Levy Tech'

export const ADDONS_NAV_ITEM: SidebarNavItem = {
  id: 'addons',
  href: '/addons',
  label: 'תוספים',
  icon: 'lock',
  locked: true,
}

export function getLockedAddonsCount(
  enabledFeatures: SidebarNavItemId[] | null | undefined
): number {
  return getLockedPaidAddonsCount(enabledFeatures)
}

export function appendAddonsNavIfNeeded(
  items: SidebarNavItem[],
  enabledFeatures: SidebarNavItemId[] | null | undefined
): SidebarNavItem[] {
  if (getLockedAddonsCount(enabledFeatures) === 0) return items
  if (items.some((item) => item.id === 'addons')) return items
  return [...items, ADDONS_NAV_ITEM]
}
