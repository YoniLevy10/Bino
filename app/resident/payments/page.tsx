'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

type Charge = {
  id: string
  title: string
  amount: number
  status: string
  period_label: string | null
  due_date: string | null
  can_pay: boolean
  is_overdue: boolean
  payment_pending_confirmation: boolean
  invoice: { available: boolean; url: string | null }
}

function PaymentsInner() {
  const searchParams = useSearchParams()
  const returned = searchParams.get('returned') === '1'
  const [charges, setCharges] = useState<Charge[]>([])
  const [openBalance, setOpenBalance] = useState(0)
  const [error, setError] = useState('')
  const [payingId, setPayingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/resident/charges')
        const json = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setError(json.error || 'טעינת חיובים נכשלה')
          return
        }
        setCharges(json.charges || [])
        setOpenBalance(json.openBalance || 0)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'שגיאת רשת')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function pay(chargeId: string) {
    setPayingId(chargeId)
    setError('')
    try {
      const res = await fetch(`/api/resident/charges/${chargeId}/pay`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'לא ניתן להתחיל תשלום')
        return
      }
      // Return hint: success page should not mark paid; we add returned=1 on back path via pay success UX.
      window.location.href = `${json.payPath}?from=resident`
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאת רשת')
    } finally {
      setPayingId(null)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>התשלומים שלי</h1>
      <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #E8E8ED' }}>
        יתרה פתוחה: <strong>₪{openBalance.toLocaleString('he-IL')}</strong>
      </div>
      {returned ? (
        <div role="status" style={{ background: '#E5F2FF', padding: 12, borderRadius: 12 }}>
          התשלום בבדיקה — הסטטוס יתעדכן לאחר אישור השרת. אישור תשלום אינו חשבונית.
        </div>
      ) : null}
      {error ? (
        <div role="alert" style={{ background: '#FFEBE9', color: '#FF3B30', padding: 12, borderRadius: 12 }}>
          {error}
        </div>
      ) : null}
      {charges.length === 0 ? (
        <p style={{ color: '#86868B' }}>אין חיובים שפורסמו עבורכם</p>
      ) : (
        charges.map((c) => (
          <article
            key={c.id}
            style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #E8E8ED' }}
          >
            <div style={{ fontWeight: 700 }}>{c.title}</div>
            <div style={{ fontSize: 13, color: '#86868B', marginTop: 4 }}>
              {c.period_label || '—'}
              {c.due_date ? ` · פירעון ${c.due_date}` : ''}
              {c.is_overdue ? ' · באיחור' : ''}
            </div>
            <div style={{ marginTop: 8, fontSize: 18, fontWeight: 800 }}>
              ₪{Number(c.amount).toLocaleString('he-IL')}
            </div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              סטטוס: {statusLabel(c)}
              {c.payment_pending_confirmation ? ' (ממתין לאישור שרת)' : ''}
            </div>
            {c.invoice.available && c.invoice.url ? (
              <a href={c.invoice.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 8 }}>
                מסמך כספי שהתקבל
              </a>
            ) : c.status === 'paid' ? (
              <div style={{ fontSize: 13, color: '#86868B', marginTop: 8 }}>
                התשלום אושר · המסמך הכספי טרם התקבל
              </div>
            ) : null}
            {c.can_pay ? (
              <button
                type="button"
                disabled={payingId === c.id}
                onClick={() => void pay(c.id)}
                style={{
                  marginTop: 12,
                  width: '100%',
                  minHeight: 48,
                  border: 'none',
                  borderRadius: 12,
                  background: '#007AFF',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 16,
                }}
              >
                {payingId === c.id ? 'מעביר לתשלום…' : 'תשלום מאובטח'}
              </button>
            ) : null}
          </article>
        ))
      )}
    </div>
  )
}

function statusLabel(c: Charge): string {
  switch (c.status) {
    case 'sent':
      return 'ממתין לתשלום'
    case 'paid':
      return 'שולם'
    case 'failed':
      return 'תשלום נכשל'
    default:
      return c.status
  }
}

export default function ResidentPaymentsPage() {
  return (
    <Suspense fallback={<p>טוען…</p>}>
      <PaymentsInner />
    </Suspense>
  )
}
