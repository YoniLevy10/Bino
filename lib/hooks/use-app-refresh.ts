'use client'

import { useEffect } from 'react'
import { APP_REFRESH_EVENT } from '@/lib/app-refresh'

/** Re-run data loaders when the user pulls to refresh (mobile). */
export function useAppRefreshListener(handler: () => void | Promise<void>): void {
  useEffect(() => {
    const onRefresh = () => {
      void handler()
    }
    window.addEventListener(APP_REFRESH_EVENT, onRefresh)
    return () => window.removeEventListener(APP_REFRESH_EVENT, onRefresh)
  }, [handler])
}
