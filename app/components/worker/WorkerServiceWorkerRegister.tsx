'use client'

import { useEffect } from 'react'
import { ensureServiceWorkerReady } from '@/lib/service-worker-register'

/** Ensures /sw.js is registered on worker portal (required for push). */
export function WorkerServiceWorkerRegister() {
  useEffect(() => {
    void ensureServiceWorkerReady().catch(() => {
      /* push flow shows user-facing error on subscribe */
    })
  }, [])
  return null
}
