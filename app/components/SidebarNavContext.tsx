'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { resolveBamakorClientIdForBrowser } from '@/lib/bamakor-client'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import {
  appendAddonsNavAlways,
  enabledAddonKeysFromEntitlements,
  getLockedAddonsCountFromEntitlements,
  injectPaidAddonNavItems,
} from '@/lib/addons-nav'
import { parseEnabledNavFeaturesFromDb } from '@/lib/client-nav-features'
import { navIdsForEnabledAddonKeys } from '@/lib/paid-addons'
import {
  DEFAULT_SIDEBAR_NAV_ORDER,
  applySidebarNavLabels,
  parseSidebarNavOrderFromDb,
  parseSidebarNavLabelsFromDb,
  resolveSidebarNavItems,
  splitMobileBottomNav,
  type SidebarNavItem,
  type SidebarNavItemId,
  type SidebarNavLabels,
} from '@/lib/sidebar-nav'
import { usePaidAddons } from './PaidAddonsContext'

type SidebarNavContextValue = {
  navItems: SidebarNavItem[]
  mobileBottomPrimary: SidebarNavItem[]
  mobileBottomMore: SidebarNavItem[]
  orderIds: SidebarNavItemId[]
  enabledFeatures: SidebarNavItemId[] | null
  lockedAddonsCount: number
  isBootstrapped: boolean
  refreshNav: () => Promise<void>
  setLocalOrderIds: (ids: SidebarNavItemId[]) => void
}

const defaultItems = appendAddonsNavAlways(resolveSidebarNavItems(null, null))
const defaultSplit = splitMobileBottomNav(defaultItems)

const SidebarNavContext = createContext<SidebarNavContextValue>({
  navItems: defaultItems,
  mobileBottomPrimary: defaultSplit.primary,
  mobileBottomMore: defaultSplit.more,
  orderIds: [...DEFAULT_SIDEBAR_NAV_ORDER],
  enabledFeatures: null,
  lockedAddonsCount: 0,
  isBootstrapped: false,
  refreshNav: async () => {},
  setLocalOrderIds: () => {},
})

const NAV_CACHE_TTL = 5 * 60 * 1000

type NavCachePayload = {
  orderIds: SidebarNavItemId[]
  enabledFeatures: SidebarNavItemId[] | null
  navLabels: SidebarNavLabels
}

function readNavCache(clientId: string): NavCachePayload | null {
  try {
    const raw = localStorage.getItem(`bamakor_nav_v5_${clientId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      orderIds: unknown
      enabledFeatures?: unknown
      navLabels?: unknown
      ts: number
    }
    if (Date.now() - parsed.ts >= NAV_CACHE_TTL) return null
    const orderIds = parseSidebarNavOrderFromDb(parsed.orderIds)
    if (!orderIds) return null
    return {
      orderIds,
      enabledFeatures: parseEnabledNavFeaturesFromDb(parsed.enabledFeatures ?? null),
      navLabels: parseSidebarNavLabelsFromDb(parsed.navLabels ?? null),
    }
  } catch {}
  return null
}

function writeNavCache(clientId: string, payload: NavCachePayload) {
  try {
    localStorage.setItem(`bamakor_nav_v5_${clientId}`, JSON.stringify({ ...payload, ts: Date.now() }))
  } catch {}
}

function buildNavItems(
  orderIds: SidebarNavItemId[],
  enabledFeatures: SidebarNavItemId[] | null,
  enabledAddonKeys: string[],
  navLabels: SidebarNavLabels
): SidebarNavItem[] {
  const paidNavIds = new Set(navIdsForEnabledAddonKeys(enabledAddonKeys))
  const base = resolveSidebarNavItems(orderIds, enabledFeatures, paidNavIds)
  const withPaid = injectPaidAddonNavItems(base, enabledAddonKeys)
  return applySidebarNavLabels(appendAddonsNavAlways(withPaid), navLabels)
}

export function SidebarNavProvider({ children }: { children: ReactNode }) {
  const { addons } = usePaidAddons()
  const enabledAddonKeys = useMemo(() => enabledAddonKeysFromEntitlements(addons), [addons])

  const [orderIds, setOrderIds] = useState<SidebarNavItemId[]>([...DEFAULT_SIDEBAR_NAV_ORDER])
  const [enabledFeatures, setEnabledFeatures] = useState<SidebarNavItemId[] | null>(null)
  const [navLabels, setNavLabels] = useState<SidebarNavLabels>({})
  const [isBootstrapped, setIsBootstrapped] = useState(false)

  const applyNavState = useCallback(
    (ids: SidebarNavItemId[], enabled: SidebarNavItemId[] | null, labels: SidebarNavLabels) => {
      setOrderIds(ids)
      setEnabledFeatures(enabled)
      setNavLabels(labels)
    },
    []
  )

  const loadNav = useCallback(async () => {
    try {
      const clientId = await resolveBamakorClientIdForBrowser()
      const cached = readNavCache(clientId)
      if (cached) applyNavState(cached.orderIds, cached.enabledFeatures, cached.navLabels)

      const res = await fetchWithTimeout('/api/client/nav-config')
      const json = (await res.json().catch(() => ({}))) as {
        sidebar_nav_order?: unknown
        sidebar_nav_labels?: unknown
        enabled_nav_features?: unknown
        error?: string
      }
      if (!res.ok) {
        throw new Error(json.error || `nav-config ${res.status}`)
      }

      const parsedOrder = parseSidebarNavOrderFromDb(json.sidebar_nav_order)
      const parsedEnabled = parseEnabledNavFeaturesFromDb(json.enabled_nav_features)
      const parsedLabels = parseSidebarNavLabelsFromDb(json.sidebar_nav_labels)
      const resolved = resolveSidebarNavItems(parsedOrder, parsedEnabled)
      const nextIds = resolved
        .map((item) => item.id)
        .filter((id): id is SidebarNavItemId => id !== 'addons')
      applyNavState(nextIds, parsedEnabled, parsedLabels)
      writeNavCache(clientId, { orderIds: nextIds, enabledFeatures: parsedEnabled, navLabels: parsedLabels })
    } catch (e) {
      console.error('[SidebarNav] load failed:', e instanceof Error ? e.message : e)
      applyNavState([...DEFAULT_SIDEBAR_NAV_ORDER], null, {})
    } finally {
      setIsBootstrapped(true)
    }
  }, [applyNavState])

  useEffect(() => {
    void loadNav()
  }, [loadNav])

  const lockedAddonsCount = useMemo(
    () => getLockedAddonsCountFromEntitlements(addons),
    [addons]
  )

  const navItems = useMemo(
    () => buildNavItems(orderIds, enabledFeatures, enabledAddonKeys, navLabels),
    [orderIds, enabledFeatures, enabledAddonKeys, navLabels]
  )

  const { primary: mobileBottomPrimary, more: mobileBottomMore } = useMemo(
    () => splitMobileBottomNav(navItems),
    [navItems]
  )

  const setLocalOrderIds = useCallback(
    (ids: SidebarNavItemId[]) => {
      applyNavState(ids, enabledFeatures, navLabels)
    },
    [applyNavState, enabledFeatures, navLabels]
  )

  const value = useMemo(
    () => ({
      navItems,
      mobileBottomPrimary,
      mobileBottomMore,
      orderIds,
      enabledFeatures,
      lockedAddonsCount,
      isBootstrapped,
      refreshNav: loadNav,
      setLocalOrderIds,
    }),
    [
      navItems,
      mobileBottomPrimary,
      mobileBottomMore,
      orderIds,
      enabledFeatures,
      lockedAddonsCount,
      isBootstrapped,
      loadNav,
      setLocalOrderIds,
    ]
  )

  return <SidebarNavContext.Provider value={value}>{children}</SidebarNavContext.Provider>
}

export function useSidebarNav(): SidebarNavContextValue {
  return useContext(SidebarNavContext)
}
