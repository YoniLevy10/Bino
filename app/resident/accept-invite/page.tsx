'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ResidentAlert,
  ResidentAuthFrame,
  ResidentMuted,
  ResidentPageTitle,
  ResidentPrimaryButton,
  residentTheme,
} from '@/app/components/resident/residentUi'

function AcceptInviteInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token') || ''
  const [status, setStatus] = useState<'working' | 'ok' | 'error'>('working')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setError('חסר אסימון הזמנה בקישור')
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/resident/auth/accept-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const json = (await res.json()) as { error?: string }
        if (cancelled) return
        if (res.status === 401) {
          router.replace(
            `/resident/login?token=${encodeURIComponent(token)}&redirectTo=${encodeURIComponent(`/resident/accept-invite?token=${token}`)}`
          )
          return
        }
        if (!res.ok) {
          setStatus('error')
          setError(json.error || 'קבלת הזמנה נכשלה')
          return
        }
        setStatus('ok')
        router.replace('/resident')
      } catch (e) {
        if (cancelled) return
        setStatus('error')
        setError(e instanceof Error ? e.message : 'שגיאת רשת')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, router])

  return (
    <ResidentAuthFrame brandName="BINO">
      <ResidentPageTitle>אישור הזמנה</ResidentPageTitle>
      {status === 'working' ? (
        <ResidentMuted style={{ marginTop: 12 }}>מאמתים הזמנה…</ResidentMuted>
      ) : null}
      {status === 'error' ? (
        <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          <ResidentAlert tone="error">{error}</ResidentAlert>
          <ResidentPrimaryButton
            href={`/resident/login?token=${encodeURIComponent(token)}`}
          >
            מעבר להתחברות
          </ResidentPrimaryButton>
          <Link
            href="/resident/login"
            style={{
              textAlign: 'center',
              color: residentTheme.colors.primary,
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            חזרה לכניסה
          </Link>
        </div>
      ) : null}
      {status === 'ok' ? (
        <ResidentMuted style={{ marginTop: 12 }}>ההזמנה אושרה — מעבירים לפורטל…</ResidentMuted>
      ) : null}
    </ResidentAuthFrame>
  )
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div dir="rtl" style={{ padding: 24, color: residentTheme.colors.textMuted }}>
          טוען…
        </div>
      }
    >
      <AcceptInviteInner />
    </Suspense>
  )
}
