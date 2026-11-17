'use client'

import { Suspense } from 'react'
import { FinanceWorkspace } from '@/app/components/finance/FinanceWorkspace'
import { LoadingSpinner } from '@/app/components/ui'

/** Alias route — same unified כספים shell, reports section. */
export default function FinanceReportsPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <LoadingSpinner />
        </div>
      }
    >
      <FinanceWorkspace forcedSection="reports" />
    </Suspense>
  )
}
