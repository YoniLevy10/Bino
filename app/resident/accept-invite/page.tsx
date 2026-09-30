'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

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
    <div dir="rtl" style={{ padding: 24, maxWidth: 480, margin: '40px auto' }}>
      {status === 'working' ? <p>מאמתים הזמנה…</p> : null}
      {status === 'error' ? (
        <div role="alert" style={{ background: '#FFEBE9', color: '#FF3B30', padding: 16, borderRadius: 12 }}>
          <p style={{ marginTop: 0 }}>{error}</p>
          <Link href={`/resident/login?token=${encodeURIComponent(token)}`}>מעבר להתחברות</Link>
        </div>
      ) : null}
      {status === 'ok' ? <p>ההזמנה אושרה — מעבירים לפורטל…</p> : null}
    </div>
  )
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<div dir="rtl" style={{ padding: 24 }}>טוען…</div>}>
      <AcceptInviteInner />
    </Suspense>
  )
}
