'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { AddonFeaturePageShell } from '@/app/components/addons/AddonFeaturePageShell'
import { BuildingBankPanel } from '@/app/components/projects/BuildingBankPanel'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { LoadingSpinner, theme } from '@/app/components/ui'

function FinanceBankInner() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  return (
    <AddonFeaturePageShell
      title="חשבון הבנק"
      mobileSubtitle="חשבון עסקי אחד · כל הבניינים"
      desktopSubtitle="זיכרון תפעולי כספי — יתרות, תנועות והעברות ברמת העסק"
      contentMaxWidth={1200}
      headerActions={
        <Link
          href="/finance"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            minHeight: 40,
            padding: '0 14px',
            borderRadius: theme.radius.sm,
            border: `1px solid ${theme.colors.border}`,
            background: theme.colors.surface,
            color: theme.colors.textSecondary,
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.semibold,
            textDecoration: 'none',
          }}
        >
          ← כספים
        </Link>
      }
    >
      <BuildingBankPanel isMobile={isMobile} />
    </AddonFeaturePageShell>
  )
}

/** Dedicated bank account screen — sidebar «חשבון בנק». */
export default function FinanceBankPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <LoadingSpinner />
        </div>
      }
    >
      <FinanceBankInner />
    </Suspense>
  )
}
