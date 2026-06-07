import type { AddonEntitlement } from '@/lib/paid-addons'
import { navIdsForEnabledAddonKeys } from '@/lib/paid-addons'
import {
  SIDEBAR_NAV_REGISTRY,
  type SidebarNavItem,
  type SidebarNavItemId,
} from '@/lib/sidebar-nav'

export const BAMAKOR_BRAND = 'במקור'
/** @deprecated use BAMAKOR_BRAND */
export const LEVY_TECH_BRAND = BAMAKOR_BRAND

export const ADDONS_NAV_ITEM: SidebarNavItem = {
  id: 'addons',
  href: '/addons',
  label: 'תוספים',
  icon: 'grid',
}

export function getLockedAddonsCountFromEntitlements(addons: AddonEntitlement[]): number {
  if (!addons.length) return 0
  return addons.filter((a) => !a.enabled).length
}

/** @deprecated use getLockedAddonsCountFromEntitlements */
export function getLockedAddonsCount(
  _enabledFeatures: SidebarNavItemId[] | null | undefined
): number {
  return 0
}

export function appendAddonsNavAlways(items: SidebarNavItem[]): SidebarNavItem[] {
  if (items.some((item) => item.id === 'addons')) return items
  return [...items, ADDONS_NAV_ITEM]
}

/** @deprecated use appendAddonsNavAlways */
export function appendAddonsNavIfNeeded(
  items: SidebarNavItem[],
  _enabledFeatures: SidebarNavItemId[] | null | undefined
): SidebarNavItem[] {
  return appendAddonsNavAlways(items)
}

export function injectPaidAddonNavItems(
  items: SidebarNavItem[],
  enabledAddonKeys: Iterable<string>
): SidebarNavItem[] {
  const paidNavIds = navIdsForEnabledAddonKeys(enabledAddonKeys)
  const seen = new Set(items.map((item) => item.id))
  const toInject: SidebarNavItem[] = []
  for (const id of paidNavIds) {
    if (!seen.has(id)) {
      toInject.push(SIDEBAR_NAV_REGISTRY[id])
      seen.add(id)
    }
  }
  if (toInject.length === 0) return items
  const addonsIdx = items.findIndex((item) => item.id === 'addons')
  if (addonsIdx >= 0) {
    return [...items.slice(0, addonsIdx), ...toInject, ...items.slice(addonsIdx)]
  }
  return [...items, ...toInject]
}

export function enabledAddonKeysFromEntitlements(addons: AddonEntitlement[]): string[] {
  return addons.filter((a) => a.enabled).map((a) => a.addon_key)
}
