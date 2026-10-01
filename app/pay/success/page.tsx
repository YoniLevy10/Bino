'use client'

import { useEffect, useState, Suspense, type CSSProperties } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

type PayStatus = {
  status: string
  title?: string
  amount_label?: string
  can_pay?: boolean
  payment_url?: string | null
  client?: { name: string }
  error?: string
}

/** Brief green confirmation, then land on branded /pay/{token} paid card. */
const REDIRECT_AFTER_MS = 2800

function PaySuccessInner() {
  const router = useRouter()
  const search = useSearchParams()
  const token = (search.get('t') || '').trim()
  const [payload, setPayload] = useState<PayStatus | null>(null)
  const [loading, setLoading] = useState(Boolean(token))

  useEffect(() => {
    if (!token) return
    let cancelled = false
    let attempts = 0

    const poll = async () => {
      attempts += 1
      try {
        const res = await fetchWithTimeout(`/api/public/pay/${encodeURIComponent(token)}`, {
          method: 'GET',
        })
        const json = (await res.json()) as PayStatus
        if (cancelled) return
        if (res.ok) {
          setPayload(json)
          if (json.status === 'paid' || attempts >= 6) {
            setLoading(false)
            return
          }
        } else {
          setPayload({ status: 'unknown', error: json.error || 'לא נמצא' })
          setLoading(false)
          return
        }
      } catch {
        if (!cancelled && attempts >= 6) {
          setLoading(false)
        }
      }
      if (!cancelled && attempts < 6) {
        window.setTimeout(() => void poll(), 1500)
      } else if (!cancelled) {
        setLoading(false)
      }
    }

    void poll()
    return () => {
      cancelled = true
    }
  }, [token])

  // After a short pause on the green screen → branded paid receipt on /pay/{token}.
  useEffect(() => {
    if (!token) return
    const paid = payload?.status === 'paid'
    const ready = paid || !loading
    if (!ready && payload === null) return

    const delay = paid ? REDIRECT_AFTER_MS : Math.max(REDIRECT_AFTER_MS, 4500)
    const id = window.setTimeout(() => {
      router.replace(`/pay/${encodeURIComponent(token)}`)
    }, delay)
    return () => window.clearTimeout(id)
  }, [token, payload, loading, router])

  const paid = payload?.status === 'paid'
  const pending = Boolean(token) && !paid && (loading || payload?.status === 'sent')

  return (
    <main dir="rtl" style={styles.shell}>
      <div style={styles.panel}>
        <p style={styles.brand}>{payload?.client?.name || 'Bino'}</p>
        <h1 style={styles.title}>
          {paid ? 'התשלום התקבל' : pending ? 'בודקים את התשלום…' : 'התשלום התקבל'}
        </h1>
        {payload?.amount_label ? <p style={styles.amount}>{payload.amount_label}</p> : null}
        <p style={styles.sub}>
          {paid
            ? 'מעבירים לאישור המלא…'
            : pending
              ? 'אם שילמתם עכשיו — האישור יופיע תוך רגעים.'
              : 'מעבירים לפרטי החיוב…'}
        </p>
      </div>
    </main>
  )
}

export default function PaySuccessPage() {
  return (
    <Suspense
      fallback={
        <main dir="rtl" style={styles.shell}>
          <p style={{ color: '#166534' }}>טוען…</p>
        </main>
      }
    >
      <PaySuccessInner />
    </Suspense>
  )
}

const styles: Record<string, CSSProperties> = {
  shell: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: 'linear-gradient(160deg, #f0fdf4 0%, #ecfdf5 40%, #f8fafc 100%)',
    fontFamily: 'Heebo, Arial, sans-serif',
  },
  panel: { textAlign: 'center', maxWidth: 420 },
  brand: {
    margin: '0 0 12px',
    fontSize: 14,
    letterSpacing: '0.04em',
    color: '#15803d',
    fontWeight: 700,
  },
  title: { margin: '0 0 12px', fontSize: 28, color: '#14532d' },
  amount: { margin: '0 0 12px', fontSize: 28, fontWeight: 800, color: '#14532d' },
  sub: { margin: '0 0 16px', fontSize: 16, color: '#166534', lineHeight: 1.6 },
}
