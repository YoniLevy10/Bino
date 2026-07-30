'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { AddonFeaturePageShell } from '@/app/components/addons/AddonFeaturePageShell'
import { Card, theme } from '../components/ui'

function CollectionsPlaceholder() {
  return (
    <Card noPadding>
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <p style={{ margin: 0, fontSize: '15px', color: theme.colors.textPrimary, lineHeight: 1.6 }}>
          גביית ועד דרך Morning — חשבונות, קישורי תשלום ושליחה לדיירים. לפני שימוש יש לחבר את חשבון
          Morning בהגדרות (מפתחות API ו-webhook).
        </p>
        <p style={{ margin: 0, fontSize: '14px', color: theme.colors.textSecondary, lineHeight: 1.6 }}>
          הגדרות חיבור:
          <Link href="/settings?tab=morning" style={{ color: theme.colors.primary, fontWeight: 600 }}>
            {' '}
            הגדרות → Morning
          </Link>
          .
        </p>
      </div>
    </Card>
  )
}

function CollectionsPageInner() {
  return (
    <AddonFeaturePageShell
      addonKey={PAID_ADDON_KEYS.collections}
      title="גביית ועד"
      mobileSubtitle="חיוב דיירים דרך Morning"
      desktopSubtitle="חיוב דיירים וקישורי תשלום דרך Morning"
    >
      <CollectionsPlaceholder />
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
