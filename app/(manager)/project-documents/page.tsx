'use client'

import { Suspense } from 'react'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { AddonFeaturePageShell } from '@/app/components/addons/AddonFeaturePageShell'
import { DocumentsFolderGrid } from '@/app/components/projects/DocumentsFolderGrid'
import { LoadingSpinner } from '@/app/components/ui'

function ProjectDocumentsPageInner() {
  return (
    <AddonFeaturePageShell
      addonKey={PAID_ADDON_KEYS.project_documents}
      title="מסמכים"
      mobileSubtitle="כרטיס לכל בניין — בתוך הבניין תתי־תיקיות וקבצים"
      desktopSubtitle="בחרו בניין כדי לנהל מסמכים, תתי־תיקיות וקבצים"
      contentMaxWidth={1200}
    >
      <DocumentsFolderGrid />
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
