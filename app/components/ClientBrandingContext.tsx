'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@/utils/supabase/client'
import { resolveBamakorClientIdForBrowser } from '@/lib/bamakor-client'
import { TENANT_CID_SESSION_KEY } from '@/lib/tenant-browser-cache'

export type ClientBranding = {
  displayName: string
  logoUrl: string | null
}

const DEFAULT_BRANDING: ClientBranding = { displayName: 'Bino', logoUrl: null }
const BRANDING_CACHE_TTL = 24 * 60 * 60 * 1000

function readBrandingCache(clientId: string): ClientBranding | null {
  try {
    const raw = localStorage.getItem(`bamakor_branding_v1_${clientId}`)
    if (!raw) return null
    const { branding, ts } = JSON.parse(raw) as { branding: ClientBranding; ts: number }
    if (branding && Date.now() - ts < BRANDING_CACHE_TTL) return branding
  } catch {}
  return null
}

/** Sync read for route loading UI — logo before React context updates. */
export function tryReadBrandingFromSessionCache(): ClientBranding | null {
  try {
    const raw = sessionStorage.getItem(TENANT_CID_SESSION_KEY)
    if (!raw) return null
    const { cid } = JSON.parse(raw) as { cid?: string }
    if (!cid) return null
    return readBrandingCache(cid)
  } catch {
    return null
  }
}

function writeBrandingCache(clientId: string, branding: ClientBranding) {
  try {
    localStorage.setItem(`bamakor_branding_v1_${clientId}`, JSON.stringify({ branding, ts: Date.now() }))
  } catch {}
}

type ClientBrandingContextValue = ClientBranding & {
  isBootstrapped: boolean
}

const ClientBrandingContext = createContext<ClientBrandingContextValue>({
  ...DEFAULT_BRANDING,
  isBootstrapped: false,
})

export function ClientBrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<ClientBranding>(DEFAULT_BRANDING)
  const [isBootstrapped, setIsBootstrapped] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const supabase = createClient()
        const clientId = await resolveBamakorClientIdForBrowser()

        const cached = readBrandingCache(clientId)
        if (cached && !cancelled) {
          setBranding(cached)
          setIsBootstrapped(true)
        }

        const { data } = await supabase
          .from('clients')
          .select('name, logo_url')
          .eq('id', clientId)
          .maybeSingle()
        if (!cancelled && data) {
          const fresh: ClientBranding = {
            displayName: (data as { name?: string | null }).name?.trim() || 'Bino',
            logoUrl: (data as { logo_url?: string | null }).logo_url?.trim() || null,
          }
          setBranding(fresh)
          writeBrandingCache(clientId, fresh)
        }
      } catch {
        // keep default branding on any error
      } finally {
        if (!cancelled) setIsBootstrapped(true)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!isBootstrapped) return
    document.title = `${branding.displayName} — ניהול תקלות ואחזקה`
  }, [branding.displayName, isBootstrapped])

  return (
    <ClientBrandingContext.Provider value={{ ...branding, isBootstrapped }}>
      {children}
    </ClientBrandingContext.Provider>
  )
}

export function useClientBranding(): ClientBrandingContextValue {
  return useContext(ClientBrandingContext)
}
