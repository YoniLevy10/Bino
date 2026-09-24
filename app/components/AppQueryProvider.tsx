'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 15 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  })
}

export function AppQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => makeQueryClient())
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
