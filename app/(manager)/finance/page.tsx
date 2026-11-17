'use client'

import { Suspense } from 'react'
import { FinanceWorkspace } from '@/app/components/finance/FinanceWorkspace'
import { LoadingSpinner } from '@/app/components/ui'

export default function FinancePage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <LoadingSpinner />
        </div>
      }
    >
      <FinanceWorkspace />
    </Suspense>
  )
}
