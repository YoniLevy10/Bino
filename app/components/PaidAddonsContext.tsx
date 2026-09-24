'use client'

import { usePathname } from 'next/navigation'
import { isWorkerPortalPath } from '@/lib/is-worker-portal-path'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { resolveBinoClientIdForBrowser } from '@/lib/bamakor-client'
import { PAID_ADDON_KEYS, type AddonEntitlement, type PaidAddonKey } from '@/lib/paid-addons'
import { ADDONS_CACHE_PREFIX } from '@/lib/tenant-browser-cache'
import { useAppRefreshListener } from '@/lib/hooks/use-app-refresh'

export type { AddonEntitlement }

type PaidAddonsContextValue = {
  isBootstrapped: boolean
  catalogMissing: boolean
  addons: AddonEntitlement[]
  hasAddon: (key: PaidAddonKey | string) => boolean
  getAddon: (key: PaidAddonKey | string) => AddonEntitlement | undefined
  refresh: () => Promise<void>
}

const PaidAddonsContext = createContext<PaidAddonsContextValue>({
  isBootstrapped: false,
  catalogMissing: false,
  addons: [],
  hasAddon: () => false,
  getAddon: () => undefined,
  refresh: async () => {},
})

const ADDONS_CACHE_TTL = 5 * 60 * 1000
const ADDONS_REFETCH_MIN_INTERVAL_MS = 60 * 1000

type AddonsCachePayload = {
  addons: AddonEntitlement[]
  catalogMissing: boolean
  ts: number
}

function readAddonsCache(clientId: string): AddonsCachePayload | null {
  try {
    const raw = localStorage.getItem(`${ADDONS_CACHE_PREFIX}${clientId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AddonsCachePayload
    if (!Array.isArray(parsed.addons) || typeof parsed.ts !== 'number') return null
    if (Date.now() - parsed.ts >= ADDONS_CACHE_TTL) return null
    return parsed
  } catch {
    return null
  }
}

function writeAddonsCache(clientId: string, payload: Omit<AddonsCachePayload, 'ts'>) {
  try {
    localStorage.setItem(
      `${ADDONS_CACHE_PREFIX}${clientId}`,
      JSON.stringify({ ...payload, ts: Date.now() } satisfies AddonsCachePayload)
    )
  } catch {}
}

type LoadOptions = {
  forceNetwork?: boolean
  skipCache?: boolean
}

export function PaidAddonsProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const isWorker = isWorkerPortalPath(pathname)
  const [isBootstrapped, setIsBootstrapped] = useState(false)
  const [catalogMissing, setCatalogMissing] = useState(false)
  const [addons, setAddons] = useState<AddonEntitlement[]>([])
  const lastNetworkFetchRef = useRef(0)

  const load = useCallback(async (opts?: LoadOptions) => {
    try {
      const clientId = await resolveBinoClientIdForBrowser()

      if (!opts?.skipCache) {
        const cached = readAddonsCache(clientId)
        if (cached) {
          setAddons(cached.addons)
          setCatalogMissing(cached.catalogMissing)
          setIsBootstrapped(true)
          lastNetworkFetchRef.current = cached.ts
          if (!opts?.forceNetwork) return
        }
      }

      const res = await fetchWithTimeout('/api/addons/entitlements')
      const json = (await res.json()) as {
        addons?: AddonEntitlement[]
        catalog_missing?: boolean
        error?: string
      }
      if (!res.ok) {
        setAddons([])
        setCatalogMissing(true)
        return
      }
      const nextAddons = json.addons || []
      const nextMissing = !!json.catalog_missing
      setCatalogMissing(nextMissing)
      setAddons(nextAddons)
      writeAddonsCache(clientId, { addons: nextAddons, catalogMissing: nextMissing })
      lastNetworkFetchRef.current = Date.now()
    } catch {
      setAddons([])
    } finally {
      setIsBootstrapped(true)
    }
  }, [])

  useEffect(() => {
    if (isWorker) {
      setAddons([])
      setCatalogMissing(false)
      setIsBootstrapped(true)
      return
    }
    void load()
  }, [isWorker, load])

  useEffect(() => {
    if (isWorker) return
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const elapsed = Date.now() - lastNetworkFetchRef.current
      if (lastNetworkFetchRef.current > 0 && elapsed < ADDONS_REFETCH_MIN_INTERVAL_MS) return
      void load({ forceNetwork: true })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [isWorker, load])

  useAppRefreshListener(
    useCallback(() => {
      if (isWorker) return
      void load({ forceNetwork: true, skipCache: true })
    }, [isWorker, load])
  )

  const refresh = useCallback(() => load({ forceNetwork: true, skipCache: true }), [load])

  const hasAddon = useCallback(
    (key: PaidAddonKey | string) => addons.some((a) => a.addon_key === key && a.enabled),
    [addons]
  )

  const getAddon = useCallback(
    (key: PaidAddonKey | string) => addons.find((a) => a.addon_key === key),
    [addons]
  )

  return (
    <PaidAddonsContext.Provider
      value={{ isBootstrapped, catalogMissing, addons, hasAddon, getAddon, refresh }}
    >
      {children}
    </PaidAddonsContext.Provider>
  )
}

export function usePaidAddons() {
  return useContext(PaidAddonsContext)
}

export { PAID_ADDON_KEYS }
