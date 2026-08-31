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
      mobileSubtitle="מי שילם / מי לא — ושליחה מרוכזת"
      desktopSubtitle="מעקב תשלומים, שליחה מרוכזת וקישורי תשלום דרך Grow"
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
