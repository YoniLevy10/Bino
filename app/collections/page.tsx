'use client'

import { Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import {
  COLLECTIONS_PRODUCT_NAME_HE,
} from '@/lib/collection-charges'
import { AddonFeaturePageShell } from '@/app/components/addons/AddonFeaturePageShell'
import { TabBar } from '@/app/components/ui/TabBar'
import { CollectionsBoard } from './CollectionsBoard'
import { CollectionsPaymentSettings } from './CollectionsPaymentSettings'

const TABS = [
  { id: 'charges', label: 'מעקב חיובים' },
  { id: 'connection', label: 'חיבור תשלומים' },
] as const

type TabId = (typeof TABS)[number]['id']

function resolveTab(raw: string | null): TabId {
  if (raw === 'connection' || raw === 'payments' || raw === 'morning' || raw === 'settings') {
    return 'connection'
  }
  return 'charges'
}

function CollectionsPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeTab = resolveTab(searchParams.get('tab'))
  const isConnection = activeTab === 'connection'
  const subtitle = isConnection
    ? 'חיבור Morning לסליקה ומסמכים'
    : 'מי שילם / מי לא — ושליחה מרוכזת'

  function goTab(id: TabId) {
    const qs = id === 'charges' ? '/collections' : `/collections?tab=${id}`
    router.replace(qs, { scroll: false })
  }

  return (
    <AddonFeaturePageShell
      addonKey={PAID_ADDON_KEYS.collections}
      title={COLLECTIONS_PRODUCT_NAME_HE}
      mobileSubtitle={subtitle}
      desktopSubtitle={
        isConnection
          ? 'חיבור חשבון Morning — סליקה, webhook ומסמכים'
          : 'מעקב חיובים, שליחה מרוכזת וקישורי תשלום דרך Morning'
      }
    >
      <TabBar
        tabs={[...TABS]}
        activeTab={activeTab}
        onTabChange={goTab}
        ariaLabel={COLLECTIONS_PRODUCT_NAME_HE}
      />
      {isConnection ? <CollectionsPaymentSettings /> : <CollectionsBoard />}
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
