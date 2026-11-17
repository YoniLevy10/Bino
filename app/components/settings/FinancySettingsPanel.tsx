'use client'

import type { CSSProperties } from 'react'
import { Card } from '@/app/components/ui'
import { FinancyConnectCard } from '@/app/components/finance/FinancyConnectCard'

type Props = {
  styles: Record<string, CSSProperties>
}

/** Settings → Financy: per-tenant connect button + API keys for this BINO client. */
export function FinancySettingsPanel({ styles }: Props) {
  return (
    <Card noPadding>
      <div style={{ ...(styles.cardInner || {}), gap: 16 }}>
        <FinancyConnectCard />
      </div>
    </Card>
  )
}
