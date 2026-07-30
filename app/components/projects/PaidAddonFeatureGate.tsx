'use client'

import type { ReactNode } from 'react'
import { type PaidAddonKey } from '@/lib/paid-addons'
import { usePaidAddons } from '../PaidAddonsContext'

type Props = {
  featureId: PaidAddonKey
  children: ReactNode
}

export function PaidAddonFeatureGate({ featureId, children }: Props) {
  const { isBootstrapped, hasAddon } = usePaidAddons()

  if (!isBootstrapped) return null

  if (hasAddon(featureId)) {
    return <>{children}</>
  }

  // Upsell lives on /addons — keep project drawer free of marketing clutter.
  return null
}
