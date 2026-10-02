'use client'

import { Suspense } from 'react'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { AddonFeaturePageShell } from '@/app/components/addons/AddonFeaturePageShell'
import { CollectionsBoard } from './CollectionsBoard'

function CollectionsPageInner() {
  return (
    <AddonFeaturePageShell
      addonKey={PAID_ADDON_KEYS.collections}
      title="גבייה"
      mobileSubtitle="כסף שנכנס · ממתינים · שליחה"
      desktopSubtitle="דשבורד גבייה — כמה נגבה, מה פתוח, ושליחה לדיירים"
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
