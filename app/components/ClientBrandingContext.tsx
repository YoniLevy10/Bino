'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@/utils/supabase/client'
import { resolveBamakorClientIdForBrowser } from '@/lib/bamakor-client'

export type ClientBranding = {
  displayName: string
  logoUrl: string | null
}

const DEFAULT_BRANDING: ClientBranding = { displayName: 'במקור', logoUrl: null }
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

function writeBrandingCache(clientId: string, branding: ClientBranding) {
  try {
    localStorage.setItem(`bamakor_branding_v1_${clientId}`, JSON.stringify({ branding, ts: Date.now() }))
  } catch {}
}

const ClientBrandingContext = createContext<ClientBranding>(DEFAULT_BRANDING)

export function ClientBrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<ClientBranding>(DEFAULT_BRANDING)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const supabase = createClient()
        const clientId = await resolveBamakorClientIdForBrowser()

        // Show cached branding immediately, fetch fresh in background
        const cached = readBrandingCache(clientId)
        if (cached && !cancelled) setBranding(cached)

        const { data } = await supabase
          .from('clients')
          .select('display_name, logo_url')
          .eq('id', clientId)
          .maybeSingle()
        if (!cancelled && data) {
          const fresh: ClientBranding = {
            displayName: (data as { display_name?: string | null }).display_name?.trim() || 'במקור',
            logoUrl: (data as { logo_url?: string | null }).logo_url?.trim() || null,
          }
          setBranding(fresh)
          writeBrandingCache(clientId, fresh)
        }
      } catch {
        // keep default branding on any error
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  return (
    <ClientBrandingContext.Provider value={branding}>
      {children}
    </ClientBrandingContext.Provider>
  )
}

export function useClientBranding(): ClientBranding {
  return useContext(ClientBrandingContext)
}
