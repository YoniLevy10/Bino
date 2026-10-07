'use client'

import { usePathname } from 'next/navigation'
import { isResidentPortalPath } from '@/lib/is-resident-portal-path'
import { isWorkerPortalPath } from '@/lib/is-worker-portal-path'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createClient } from '@/utils/supabase/client'
import { resolveBinoClientIdForBrowser } from '@/lib/bamakor-client'
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
import { NAV_CACHE_PREFIX, tryReadSessionBoundClientId } from '@/lib/tenant-browser-cache'
import { usePaidAddons } from './PaidAddonsContext'
import { useAppRefreshListener } from '@/lib/hooks/use-app-refresh'

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
/** Keep expired cache for first paint; refetch in background (SWR). */
const NAV_CACHE_STALE_MAX_MS = 24 * 60 * 60 * 1000
/** Min interval between background refetches (tab focus / auth). */
const NAV_REFETCH_MIN_INTERVAL_MS = 60 * 1000

type NavCachePayload = {
  orderIds: SidebarNavItemId[]
  enabledFeatures: SidebarNavItemId[] | null
  navLabels: SidebarNavLabels
}

function readNavCache(
  clientId: string,
  opts?: { allowStale?: boolean }
): (NavCachePayload & { ts: number; stale: boolean }) | null {
  try {
    const raw = localStorage.getItem(`${NAV_CACHE_PREFIX}${clientId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      orderIds: unknown
      enabledFeatures?: unknown
      navLabels?: unknown
      ts: number
    }
    if (typeof parsed.ts !== 'number') return null
    const age = Date.now() - parsed.ts
    const stale = age >= NAV_CACHE_TTL
    if (stale && !opts?.allowStale) return null
    if (stale && age >= NAV_CACHE_STALE_MAX_MS) return null
    const orderIds = parseSidebarNavOrderFromDb(parsed.orderIds)
    if (!orderIds) return null
    return {
      orderIds,
      enabledFeatures: parseEnabledNavFeaturesFromDb(parsed.enabledFeatures ?? null),
      navLabels: parseSidebarNavLabelsFromDb(parsed.navLabels ?? null),
      ts: parsed.ts,
      stale,
    }
  } catch {}
  return null
}

function writeNavCache(clientId: string, payload: NavCachePayload) {
  try {
    localStorage.setItem(`${NAV_CACHE_PREFIX}${clientId}`, JSON.stringify({ ...payload, ts: Date.now() }))
  } catch {}
}

function readInitialNavState(): {
  orderIds: SidebarNavItemId[]
  enabledFeatures: SidebarNavItemId[] | null
  navLabels: SidebarNavLabels
  isBootstrapped: boolean
  ts: number
} {
  if (typeof window === 'undefined') {
    return {
      orderIds: [...DEFAULT_SIDEBAR_NAV_ORDER],
      enabledFeatures: null,
      navLabels: {},
      isBootstrapped: false,
      ts: 0,
    }
  }
  const cid = tryReadSessionBoundClientId()
  if (!cid) {
    return {
      orderIds: [...DEFAULT_SIDEBAR_NAV_ORDER],
      enabledFeatures: null,
      navLabels: {},
      isBootstrapped: false,
      ts: 0,
    }
  }
  const cached = readNavCache(cid, { allowStale: true })
  if (!cached) {
    return {
      orderIds: [...DEFAULT_SIDEBAR_NAV_ORDER],
      enabledFeatures: null,
      navLabels: {},
      isBootstrapped: false,
      ts: 0,
    }
  }
  return {
    orderIds: cached.orderIds,
    enabledFeatures: cached.enabledFeatures,
    navLabels: cached.navLabels,
    isBootstrapped: true,
    ts: cached.ts,
  }
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

type LoadNavOptions = {
  /** Skip localStorage hydration — use after sign-in or explicit refresh. */
  skipCache?: boolean
  /** Force network even when localStorage TTL is still valid. */
  forceNetwork?: boolean
  /** One retry after a 401, once middleware may have rotated the auth cookies. */
  authRetry?: boolean
}

const NAV_AUTH_REQUIRED = 'נדרשת התחברות'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function SidebarNavProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isWorker = isWorkerPortalPath(pathname)
  const isResident = isResidentPortalPath(pathname)
  const skipManagerNav = isWorker || isResident
  const { addons, isBootstrapped: addonsReady } = usePaidAddons()

  const initial = useRef(readInitialNavState()).current
  const [orderIds, setOrderIds] = useState<SidebarNavItemId[]>(initial.orderIds)
  const [enabledFeatures, setEnabledFeatures] = useState<SidebarNavItemId[] | null>(
    initial.enabledFeatures
  )
  const [navLabels, setNavLabels] = useState<SidebarNavLabels>(initial.navLabels)
  const [isBootstrapped, setIsBootstrapped] = useState(initial.isBootstrapped)

  const loadGenerationRef = useRef(0)
  const lastSuccessfulFetchRef = useRef(initial.ts)
  const hasSessionRef = useRef(false)
  const sawInitialSessionRef = useRef(false)
  /** Last known enabled addon keys — never flash to [] while entitlements reload. */
  const stableAddonKeysRef = useRef<string[]>(enabledAddonKeysFromEntitlements(addons))

  const enabledAddonKeys = useMemo(() => {
    const next = enabledAddonKeysFromEntitlements(addons)
    if (addonsReady) {
      stableAddonKeysRef.current = next
      return next
    }
    // Entitlements still loading: keep previous keys so auto-addons don't vanish/reappear.
    if (stableAddonKeysRef.current.length > 0) return stableAddonKeysRef.current
    return next
  }, [addons, addonsReady])

  const applyNavState = useCallback(
    (ids: SidebarNavItemId[], enabled: SidebarNavItemId[] | null, labels: SidebarNavLabels) => {
      setOrderIds(ids)
      setEnabledFeatures(enabled)
      setNavLabels(labels)
    },
    []
  )

  const loadNav = useCallback(
    async (options?: LoadNavOptions) => {
      const generation = ++loadGenerationRef.current
      let hadCachedState = false

      try {
        const clientId = await resolveBinoClientIdForBrowser()
        if (generation !== loadGenerationRef.current) return

        if (!options?.skipCache) {
          const cached = readNavCache(clientId, { allowStale: true })
          if (cached) {
            hadCachedState = true
            applyNavState(cached.orderIds, cached.enabledFeatures, cached.navLabels)
            setIsBootstrapped(true)
            lastSuccessfulFetchRef.current = cached.ts
            // Fresh cache: skip network. Stale: paint immediately, refresh below.
            if (!cached.stale && !options?.forceNetwork) return
          }
        }

        const res = await fetchWithTimeout('/api/client/nav-config')
        if (generation !== loadGenerationRef.current) return

        const json = (await res.json().catch(() => ({}))) as {
          sidebar_nav_order?: unknown
          sidebar_nav_labels?: unknown
          enabled_nav_features?: unknown
          error?: string
        }
        if (!res.ok) {
          const message = json.error || `nav-config ${res.status}`
          // Middleware may have rotated the token on this 401 response.
          // Retry once so the next request sends the fresh cookies.
          if (res.status === 401 && message === NAV_AUTH_REQUIRED && !options?.authRetry) {
            await sleep(200)
            if (generation !== loadGenerationRef.current) return
            await loadNav({ ...options, authRetry: true })
            return
          }
          throw new Error(message)
        }

        const parsedOrder = parseSidebarNavOrderFromDb(json.sidebar_nav_order)
        const parsedEnabled = parseEnabledNavFeaturesFromDb(json.enabled_nav_features)
        const parsedLabels = parseSidebarNavLabelsFromDb(json.sidebar_nav_labels)
        // Keep addon ids from DB order so enabled tenants can pin them via settings;
        // resolveSidebarNavItems filters by paidNavIds at render time.
        const nextIds =
          parsedOrder && parsedOrder.length > 0
            ? parsedOrder
            : [...DEFAULT_SIDEBAR_NAV_ORDER]
        applyNavState(nextIds, parsedEnabled, parsedLabels)
        writeNavCache(clientId, {
          orderIds: nextIds,
          enabledFeatures: parsedEnabled,
          navLabels: parsedLabels,
        })
        lastSuccessfulFetchRef.current = Date.now()
      } catch (e) {
        if (generation !== loadGenerationRef.current) return
        const message = e instanceof Error ? e.message : e
        // No session yet (login, public pages, auth still hydrating) is expected.
        // console.error here opens the Next.js dev overlay on every load.
        if (message !== NAV_AUTH_REQUIRED) {
          console.error('[SidebarNav] load failed:', message)
        }
        if (!hadCachedState) {
          applyNavState([...DEFAULT_SIDEBAR_NAV_ORDER], null, {})
        }
      } finally {
        if (generation === loadGenerationRef.current) {
          setIsBootstrapped(true)
        }
      }
    },
    [applyNavState]
  )

  const maybeRefetchNav = useCallback(
    (options?: LoadNavOptions) => {
      const elapsed = Date.now() - lastSuccessfulFetchRef.current
      if (lastSuccessfulFetchRef.current > 0 && elapsed < NAV_REFETCH_MIN_INTERVAL_MS) return
      void loadNav(options)
    },
    [loadNav]
  )

  // SSR leaves DEFAULT order in useState; re-seed from localStorage before paint.
  useLayoutEffect(() => {
    if (skipManagerNav) return
    const hydrated = readInitialNavState()
    if (!hydrated.isBootstrapped) return
    applyNavState(hydrated.orderIds, hydrated.enabledFeatures, hydrated.navLabels)
    setIsBootstrapped(true)
    lastSuccessfulFetchRef.current = hydrated.ts
  }, [skipManagerNav, applyNavState])

  // Wait for INITIAL_SESSION. Calling getUser() on mount throws «נדרשת התחברות»
  // before the cookie session is loaded (and on every public page).
  // Do not call Supabase from inside the callback — it runs under the auth lock.
  useEffect(() => {
    if (skipManagerNav) {
      setIsBootstrapped(true)
      return
    }
    const supabase = createClient()
    let cancelled = false
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const authed = Boolean(session?.user)
      if (event === 'SIGNED_OUT' || !authed) {
        hasSessionRef.current = false
      } else {
        hasSessionRef.current = true
      }

      if (event === 'INITIAL_SESSION') {
        sawInitialSessionRef.current = true
        window.setTimeout(() => {
          if (cancelled) return
          if (session?.user) void loadNav()
          else setIsBootstrapped(true)
        }, 0)
        return
      }

      // Recovery emits SIGNED_IN before INITIAL_SESSION. The first load is
      // INITIAL_SESSION; a later SIGNED_IN is a real sign-in or tab resume.
      if (event === 'SIGNED_IN' && session?.user && sawInitialSessionRef.current) {
        window.setTimeout(() => {
          if (cancelled) return
          void loadNav({ skipCache: true, forceNetwork: true })
        }, 0)
      }
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [skipManagerNav, loadNav])

  useEffect(() => {
    if (skipManagerNav) return
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (!hasSessionRef.current) return
      maybeRefetchNav({ forceNetwork: true })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [skipManagerNav, maybeRefetchNav])

  useAppRefreshListener(
    useCallback(() => {
      if (skipManagerNav || !hasSessionRef.current) return
      void loadNav({ skipCache: true, forceNetwork: true })
    }, [skipManagerNav, loadNav])
  )

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

  const refreshNav = useCallback(
    () => loadNav({ skipCache: true, forceNetwork: true }),
    [loadNav]
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
      refreshNav,
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
      refreshNav,
      setLocalOrderIds,
    ]
  )

  return <SidebarNavContext.Provider value={value}>{children}</SidebarNavContext.Provider>
}

export function useSidebarNav(): SidebarNavContextValue {
  return useContext(SidebarNavContext)
}
