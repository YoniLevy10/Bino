'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { AddonFeaturePageShell } from '@/app/components/addons/AddonFeaturePageShell'
import { AddonProjectPicker } from '@/app/components/addons/AddonProjectPicker'
import { BuildingReportsPanel } from '@/app/components/projects/BuildingReportsPanel'
import { LoadingSpinner, theme } from '@/app/components/ui'

function FinanceReportsInner() {
  return (
    <AddonFeaturePageShell
      title="דוחות"
      mobileSubtitle="תקציב מול ביצוע · עלות תחזוקה לבניין"
      desktopSubtitle="הנהלת חשבונות בניין — דוח תקופתי, פירוט והשוואות"
    >
      <div style={{ marginBottom: 12 }}>
        <Link
          href="/finance"
          style={{
            fontSize: theme.typography.fontSize.sm,
            fontWeight: theme.typography.fontWeight.semibold,
            color: theme.colors.primary,
            textDecoration: 'none',
          }}
        >
          ← חזרה לכספים (רישום הוצאות)
        </Link>
      </div>
      <AddonProjectPicker emptyHint="הוסיפו בניין בדף פרויקטים כדי לצפות בדוחות.">
        {(project) => (
          <BuildingReportsPanel projectId={project.id} projectName={project.name} />
        )}
      </AddonProjectPicker>
    </AddonFeaturePageShell>
  )
}

export default function FinanceReportsPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <LoadingSpinner />
        </div>
      }
    >
      <FinanceReportsInner />
    </Suspense>
  )
}
