'use client'

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { PAID_ADDON_KEYS, type PaidAddonKey } from '@/lib/paid-addons'

export type AddonEntitlement = {
  addon_key: string
  name_he: string
  description_he: string | null
  price_ils_monthly: number
  enabled: boolean
}

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

export function PaidAddonsProvider({ children }: { children: ReactNode }) {
  const [isBootstrapped, setIsBootstrapped] = useState(false)
  const [catalogMissing, setCatalogMissing] = useState(false)
  const [addons, setAddons] = useState<AddonEntitlement[]>([])

  const load = useCallback(async () => {
    try {
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
      setCatalogMissing(!!json.catalog_missing)
      setAddons(json.addons || [])
    } catch {
      setAddons([])
    } finally {
      setIsBootstrapped(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

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
      value={{ isBootstrapped, catalogMissing, addons, hasAddon, getAddon, refresh: load }}
    >
      {children}
    </PaidAddonsContext.Provider>
  )
}

export function usePaidAddons() {
  return useContext(PaidAddonsContext)
}

export { PAID_ADDON_KEYS }
