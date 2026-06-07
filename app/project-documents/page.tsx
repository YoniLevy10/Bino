'use client'

import { Suspense } from 'react'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { AddonFeaturePageShell } from '@/app/components/addons/AddonFeaturePageShell'
import { AddonProjectPicker } from '@/app/components/addons/AddonProjectPicker'
import { ProjectDocumentsPanel } from '@/app/components/projects/ProjectDocumentsPanel'
import { LoadingSpinner } from '../components/ui'

function ProjectDocumentsPageInner() {
  return (
    <AddonFeaturePageShell
      addonKey={PAID_ADDON_KEYS.project_documents}
      title="תיקיית מסמכים"
      mobileSubtitle="ארכיון קבצים לפי בניין"
      desktopSubtitle="העלאה, הורדה וארכיון מסמכים לפי פרויקט"
    >
      <AddonProjectPicker emptyHint="הוסיפו בניין בדף פרויקטים כדי לנהל מסמכים.">
        {(project) => <ProjectDocumentsPanel projectId={project.id} />}
      </AddonProjectPicker>
    </AddonFeaturePageShell>
  )
}

export default function ProjectDocumentsPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <LoadingSpinner />
        </div>
      }
    >
      <ProjectDocumentsPageInner />
    </Suspense>
  )
}
