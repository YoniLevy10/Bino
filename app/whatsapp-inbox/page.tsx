'use client'

import { Suspense } from 'react'
import { PAID_ADDON_KEYS } from '@/lib/paid-addons'
import { AddonFeaturePageShell } from '@/app/components/addons/AddonFeaturePageShell'
import { WhatsAppInboxPanel } from '@/app/components/whatsapp/WhatsAppInboxPanel'
import { LoadingSpinner } from '../components/ui'

function WhatsAppInboxInner() {
  return (
    <AddonFeaturePageShell
      addonKey={PAID_ADDON_KEYS.whatsapp_inbox}
      title="תיבת WhatsApp"
      mobileSubtitle="שיחות עם דיירים בזמן אמת"
      desktopSubtitle="צפייה והשבה לדיירים — בתוך חלון 24 שעות ממסר אחרון"
    >
      <WhatsAppInboxPanel />
    </AddonFeaturePageShell>
  )
}

export default function WhatsAppInboxPage() {
  return (
    <Suspense
      fallback={
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <LoadingSpinner />
        </div>
      }
    >
      <WhatsAppInboxInner />
    </Suspense>
  )
}
