'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@/utils/supabase/client'
import { resolveBamakorClientIdForBrowser } from '@/lib/bamakor-client'
import {
  clearTenantBrowserCaches,
  LAST_AUTH_UID_KEY,
  TENANT_CID_SESSION_KEY,
} from '@/lib/tenant-browser-cache'

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

/**
 * Sync read for route loading UI — logo before React context updates.
 * Only returns branding when session cid is bound to the current auth uid
 * (avoids flashing another tenant's logo after magic-link / account switch).
 */
export function tryReadBrandingFromSessionCache(): ClientBranding | null {
  try {
    const raw = sessionStorage.getItem(TENANT_CID_SESSION_KEY)
    if (!raw) return null
    const { cid, uid } = JSON.parse(raw) as { cid?: string; uid?: string }
    if (!cid || !uid) return null
    const lastUid = sessionStorage.getItem(LAST_AUTH_UID_KEY)
    if (!lastUid || lastUid !== uid) return null
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
  const authUidRef = useRef<string>('')

  const loadBranding = useCallback(async (opts?: { resetFirst?: boolean }) => {
    if (opts?.resetFirst) {
      setBranding(DEFAULT_BRANDING)
      setIsBootstrapped(false)
    }
    try {
      const supabase = createClient()
      const clientId = await resolveBamakorClientIdForBrowser()

      const cached = readBrandingCache(clientId)
      if (cached) {
        setBranding(cached)
        setIsBootstrapped(true)
      }

      const { data } = await supabase
        .from('clients')
        .select('name, logo_url')
        .eq('id', clientId)
        .maybeSingle()
      if (data) {
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
      setIsBootstrapped(true)
    }
  }, [])

  useEffect(() => {
    void loadBranding()
  }, [loadBranding])

  useEffect(() => {
    const supabase = createClient()
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? ''
      const prevUid = authUidRef.current

      if (event === 'SIGNED_OUT') {
        authUidRef.current = ''
        clearTenantBrowserCaches()
        setBranding(DEFAULT_BRANDING)
        setIsBootstrapped(true)
        return
      }

      if (uid && prevUid && prevUid !== uid) {
        clearTenantBrowserCaches()
        authUidRef.current = uid
        void loadBranding({ resetFirst: true })
        return
      }

      if (uid) {
        authUidRef.current = uid
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [loadBranding])

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
