'use client'

import { useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { clearTenantBrowserCaches, LAST_AUTH_UID_KEY } from '@/lib/tenant-browser-cache'

/**
 * Clears tenant branding / client-id caches when auth user changes or signs out.
 * Prevents showing the previous tenant after account switch.
 * Push flags are cleared with caches; ManagerPushSync re-claims the endpoint for the new tenant.
 * (Server unsubscribe must happen before signOut — see NavSignOutButton / login.)
 */
export function TenantAuthSync() {
  useEffect(() => {
    const supabase = createClient()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const uid = session?.user?.id ?? ''
      let prevUid = ''
      try {
        prevUid = sessionStorage.getItem(LAST_AUTH_UID_KEY) ?? ''
      } catch {
        /* ignore */
      }

      if (event === 'SIGNED_OUT') {
        clearTenantBrowserCaches()
        try {
          sessionStorage.removeItem(LAST_AUTH_UID_KEY)
        } catch {
          /* ignore */
        }
        return
      }

      if (uid && prevUid && prevUid !== uid) {
        clearTenantBrowserCaches()
      }

      if (uid) {
        try {
          sessionStorage.setItem(LAST_AUTH_UID_KEY, uid)
        } catch {
          /* ignore */
        }
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return null
}
