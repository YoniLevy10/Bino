'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'

const WorkTimer = dynamic(() => import('./WorkTimer').then((m) => ({ default: m.WorkTimer })), {
  ssr: false,
})
const OfflineIndicator = dynamic(
  () => import('./OfflineIndicator').then((m) => ({ default: m.OfflineIndicator })),
  { ssr: false }
)
const InstallPromptBanner = dynamic(
  () => import('./InstallPromptBanner').then((m) => ({ default: m.InstallPromptBanner })),
  { ssr: false }
)
const UpdateNotification = dynamic(
  () => import('./UpdateNotification').then((m) => ({ default: m.UpdateNotification })),
  { ssr: false }
)

function scheduleIdle(fn: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(fn, { timeout: 2500 })
    return () => window.cancelIdleCallback(id)
  }
  const id = window.setTimeout(fn, 1200)
  return () => window.clearTimeout(id)
}

/** Non-critical UI — load after first paint so ticket/WhatsApp flows stay fast. */
export function DeferredLayoutExtras() {
  const [ready, setReady] = useState(false)

  useEffect(() => scheduleIdle(() => setReady(true)), [])

  if (!ready) return null

  return (
    <>
      <OfflineIndicator />
      <InstallPromptBanner />
      <UpdateNotification />
      <WorkTimer />
    </>
  )
}
