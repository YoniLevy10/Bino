'use client'

import { Suspense } from 'react'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { AddonFeaturePageShell } from '@/app/components/addons/AddonFeaturePageShell'
import { AddonProjectPicker } from '@/app/components/addons/AddonProjectPicker'
import { ProjectPilotSmsPanel } from '@/app/components/projects/ProjectPilotSmsPanel'
import { LoadingSpinner } from '../components/ui'

function PilotSmsPageInner() {
  return (
    <AddonFeaturePageShell
      addonKey={PAID_ADDON_KEYS.pilot_sms}
      title="SMS פיילוט לדיירים"
      mobileSubtitle="הודעת פתיחה לדיירי הבניין"
      desktopSubtitle="שליחת הודעת פתיחה רב-לשונית לכל דיירי הבניין עם מספר טלפון"
    >
      <AddonProjectPicker emptyHint="הוסיפו בניין בדף פרויקטים כדי לשלוח SMS פיילוט.">
        {(project) => (
          <ProjectPilotSmsPanel projectId={project.id} projectName={project.name} />
        )}
      </AddonProjectPicker>
    </AddonFeaturePageShell>
  )
}

export default function PilotSmsPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <LoadingSpinner />
        </div>
      }
    >
      <PilotSmsPageInner />
    </Suspense>
  )
}
