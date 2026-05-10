'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@/utils/supabase/client'
import { resolveBamakorClientIdForBrowser } from '@/lib/bamakor-client'

export type ClientBranding = {
  displayName: string
  logoUrl: string | null
}

const DEFAULT_BRANDING: ClientBranding = { displayName: 'במקור', logoUrl: null }

const ClientBrandingContext = createContext<ClientBranding>(DEFAULT_BRANDING)

export function ClientBrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<ClientBranding>(DEFAULT_BRANDING)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const supabase = createClient()
        const clientId = await resolveBamakorClientIdForBrowser()
        const { data } = await supabase
          .from('clients')
          .select('display_name, logo_url')
          .eq('id', clientId)
          .maybeSingle()
        if (!cancelled && data) {
          setBranding({
            displayName: (data as { display_name?: string | null }).display_name?.trim() || 'במקור',
            logoUrl: (data as { logo_url?: string | null }).logo_url?.trim() || null,
          })
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
