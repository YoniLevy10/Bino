'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  ResidentAlert,
  ResidentAuthFrame,
  ResidentMuted,
  ResidentPageTitle,
  residentTheme,
} from '@/app/components/resident/residentUi'

function ResidentLoginNotice() {
  const searchParams = useSearchParams()
  const noAccess = searchParams.get('error') === 'no_access'

  return (
    <ResidentAuthFrame brandName="BINO">
      <ResidentPageTitle>כניסה לפורטל הדיירים</ResidentPageTitle>
      <ResidentMuted style={{ margin: '10px 0 0' }}>
        הכניסה אפשרית רק דרך הקישור הייעודי לבניין. חברת הניהול שולחת את הקישור, ובתוכו מזינים
        את מספר הטלפון הרשום בבניין.
      </ResidentMuted>
      {noAccess ? (
        <div style={{ marginTop: 16 }}>
          <ResidentAlert tone="error">
            אין חברות פעילה בפורטל עבור חשבון זה. פנו לחברת הניהול.
          </ResidentAlert>
        </div>
      ) : null}
    </ResidentAuthFrame>
  )
}

export default function ResidentLoginPage() {
  return (
    <Suspense
      fallback={
        <div dir="rtl" style={{ padding: 24, color: residentTheme.colors.textMuted }}>
          טוען…
        </div>
      }
    >
      <ResidentLoginNotice />
    </Suspense>
  )
}
