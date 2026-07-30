import type { AddonEntitlement } from '@/lib/paid-addons'
import {
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

/**
 * Paid add-ons stay on `/addons` by default (see ADDON_ONLY_SIDEBAR_NAV_IDS).
 * Do not auto-inject every enabled addon into the top-level sidebar — that
 * balloons the nav. Custom `sidebar_nav_order` can still pin specific addons
 * via `resolveSidebarNavItems(..., paidNavIds)`.
 *
 * Kept as a no-op for call-site compatibility.
 */
export function injectPaidAddonNavItems(
  items: SidebarNavItem[],
  _enabledAddonKeys: Iterable<string>
): SidebarNavItem[] {
  return items
}

export function enabledAddonKeysFromEntitlements(addons: AddonEntitlement[]): string[] {
  return addons.filter((a) => a.enabled).map((a) => a.addon_key)
}
