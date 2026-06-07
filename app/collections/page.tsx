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
          גביית ועד דרך Morning (חשבונית ירוקה) — שלב ההקמה הושלם. חיובים, קישורי תשלום ושליחה לדיירים
          יתווספו כאן בשלב הבא.
        </p>
        <p style={{ margin: 0, fontSize: '14px', color: theme.colors.textSecondary, lineHeight: 1.6 }}>
          לפני שימוש: הגדירו מפתחות API, סליקה ומסמכים ב-
          <Link href="/settings?tab=greeninvoice" style={{ color: theme.colors.primary, fontWeight: 600 }}>
            {' '}
            הגדרות → חשבונית ירוקה
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
      mobileSubtitle="חיוב דיירים דרך חשבונית ירוקה"
      desktopSubtitle="חיוב דיירים וקישורי תשלום דרך Morning (חשבונית ירוקה)"
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
