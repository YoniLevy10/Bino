'use client'

import { Suspense } from 'react'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { AddonFeaturePageShell } from '@/app/components/addons/AddonFeaturePageShell'
import { CollectionsBoard } from './CollectionsBoard'

function CollectionsPageInner() {
  return (
    <AddonFeaturePageShell
      addonKey={PAID_ADDON_KEYS.collections}
      title="גביית ועד"
      mobileSubtitle="ועד הבית / דמי ועד — תשלום חודשי"
      desktopSubtitle="ועד הבית / דמי ועד — תשלום חודשי"
    >
      <CollectionsBoard />
    </AddonFeaturePageShell>
  )
}

export default function CollectionsPage() {
  return (
    <Suspense fallback={null}>
      <CollectionsPageInner />
    </Suspense>
  )
}
