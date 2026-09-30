'use client'

import { useQuery } from '@tanstack/react-query'
import { resolveBinoClientIdForBrowser } from '@/lib/bamakor-client'
import { tryReadSessionBoundClientId } from '@/lib/tenant-browser-cache'

/** Shared RQ key — seed from sync cid cache so list queries do not wait on auth. */
export const TENANT_CLIENT_ID_QUERY_KEY = ['tenant-client-id'] as const

/**
 * Resolves the manager tenant client id, painting immediately from session/local
 * cache when available (avoids waterfall before tickets/projects/workers).
 */
export function useTenantClientId(options?: { enabled?: boolean }) {
  const initial =
    typeof window !== 'undefined' ? tryReadSessionBoundClientId() : null

  return useQuery({
    queryKey: TENANT_CLIENT_ID_QUERY_KEY,
    queryFn: () => resolveBinoClientIdForBrowser(),
    staleTime: 5 * 60_000,
    enabled: options?.enabled !== false,
    ...(initial
      ? { initialData: initial, initialDataUpdatedAt: Date.now() }
      : {}),
  })
}
