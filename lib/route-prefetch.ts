import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { fetchOpenTickets, OPEN_TICKETS_SHARED_LIMIT } from '@/lib/hooks/use-open-tickets'
import { fetchWorkersList } from '@/lib/hooks/use-workers-list'
import { fetchProjectsList } from '@/lib/hooks/use-projects-list'
import { fetchResidentsPage, RESIDENTS_PAGE_SIZE } from '@/lib/hooks/use-residents-list'

/** Prefetch App Router pages (+ shared RQ lists) on hover/touch/focus. */
export function navLinkPrefetchHandlers(
  href: string,
  prefetch: (href: string) => void,
  opts?: { queryClient?: QueryClient; clientId?: string | null }
) {
  const run = () => {
    prefetch(href)
    const clientId = opts?.clientId
    const qc = opts?.queryClient
    if (!clientId || !qc) return

    if (href === '/tickets' || href === '/dashboard') {
      void qc.prefetchQuery({
        queryKey: queryKeys.ticketsOpen(clientId, OPEN_TICKETS_SHARED_LIMIT),
        queryFn: () => fetchOpenTickets(clientId, OPEN_TICKETS_SHARED_LIMIT),
        staleTime: 30_000,
      })
      void qc.prefetchQuery({
        queryKey: queryKeys.workers(clientId),
        queryFn: () => fetchWorkersList(clientId),
        staleTime: 60_000,
      })
      void qc.prefetchQuery({
        queryKey: queryKeys.projects(clientId),
        queryFn: () => fetchProjectsList(clientId),
        staleTime: 60_000,
      })
    } else if (href === '/residents') {
      void qc.prefetchQuery({
        queryKey: queryKeys.residents(clientId, RESIDENTS_PAGE_SIZE),
        queryFn: async () => fetchResidentsPage(clientId, { offset: 0, limit: RESIDENTS_PAGE_SIZE }),
        staleTime: 60_000,
      })
    } else if (href === '/workers') {
      void qc.prefetchQuery({
        queryKey: queryKeys.workers(clientId),
        queryFn: () => fetchWorkersList(clientId),
        staleTime: 60_000,
      })
    } else if (href === '/projects') {
      void qc.prefetchQuery({
        queryKey: queryKeys.projects(clientId),
        queryFn: () => fetchProjectsList(clientId),
        staleTime: 60_000,
      })
    }
  }

  return {
    onMouseEnter: run,
    onTouchStart: run,
    onFocus: run,
  }
}
