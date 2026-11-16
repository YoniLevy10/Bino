'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { AddonFeaturePageShell } from '@/app/components/addons/AddonFeaturePageShell'
import { AddonProjectPicker } from '@/app/components/addons/AddonProjectPicker'
import { BuildingFinancePanel } from '@/app/components/projects/BuildingFinancePanel'
import { LoadingSpinner, theme } from '@/app/components/ui'

function FinancePageInner() {
  return (
    <AddonFeaturePageShell
      title="הכנסות והוצאות"
      mobileSubtitle="הוצאות · תקציב · עלות תחזוקה לבניין"
      desktopSubtitle="הנהלת חשבונות בניין — הוצאות ותקציב מול ביצוע"
    >
      <div style={{ marginBottom: 12 }}>
        <Link
          href="/finance/reports"
          style={{
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.primary,
            textDecoration: 'none',
          }}
        >
          לדוחות הנהלת חשבונות ←
        </Link>
      </div>
      <AddonProjectPicker emptyHint="הוסיפו בניין בדף פרויקטים כדי לנהל כספים.">
        {(project) => (
          <BuildingFinancePanel projectId={project.id} projectName={project.name} />
        )}
      </AddonProjectPicker>
    </AddonFeaturePageShell>
  )
}

export default function FinancePage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <LoadingSpinner />
        </div>
      }
    >
      <FinancePageInner />
    </Suspense>
  )
}
