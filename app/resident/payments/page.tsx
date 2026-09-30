'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  ResidentAlert,
  ResidentCard,
  ResidentMuted,
  ResidentPageTitle,
  ResidentPrimaryButton,
  residentShellStyles,
  residentTheme,
} from '@/app/components/resident/residentUi'

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
      window.location.href = `${json.payPath}?from=resident`
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאת רשת')
    } finally {
      setPayingId(null)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <ResidentPageTitle>התשלומים שלי</ResidentPageTitle>
      <ResidentCard>
        יתרה פתוחה: <strong>₪{openBalance.toLocaleString('he-IL')}</strong>
      </ResidentCard>
      {returned ? (
        <ResidentAlert tone="info">
          התשלום בבדיקה — הסטטוס יתעדכן לאחר אישור השרת. אישור תשלום אינו חשבונית.
        </ResidentAlert>
      ) : null}
      {error ? <ResidentAlert tone="error">{error}</ResidentAlert> : null}
      {charges.length === 0 ? (
        <ResidentMuted>אין חיובים שפורסמו עבורכם</ResidentMuted>
      ) : (
        charges.map((c) => (
          <ResidentCard key={c.id}>
            <div style={{ fontWeight: 700 }}>{c.title}</div>
            <div style={{ fontSize: 13, color: residentTheme.colors.textMuted, marginTop: 4 }}>
              {c.period_label || '—'}
              {c.due_date ? ` · פירעון ${c.due_date}` : ''}
              {c.is_overdue ? ' · באיחור' : ''}
            </div>
            <div style={{ ...residentShellStyles.balanceValue, fontSize: 22, marginTop: 8 }}>
              ₪{Number(c.amount).toLocaleString('he-IL')}
            </div>
            <div style={{ fontSize: 13, marginTop: 4, color: residentTheme.colors.textSecondary }}>
              סטטוס: {statusLabel(c)}
              {c.payment_pending_confirmation ? ' (ממתין לאישור שרת)' : ''}
            </div>
            {c.invoice.available && c.invoice.url ? (
              <a
                href={c.invoice.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'inline-block',
                  marginTop: 8,
                  color: residentTheme.colors.primary,
                  fontWeight: 600,
                }}
              >
                מסמך כספי שהתקבל
              </a>
            ) : c.status === 'paid' ? (
              <ResidentMuted style={{ marginTop: 8 }}>
                התשלום אושר · המסמך הכספי טרם התקבל
              </ResidentMuted>
            ) : null}
            {c.can_pay ? (
              <div style={{ marginTop: 12 }}>
                <ResidentPrimaryButton
                  disabled={payingId === c.id}
                  onClick={() => void pay(c.id)}
                >
                  {payingId === c.id ? 'מעביר לתשלום…' : 'תשלום מאובטח'}
                </ResidentPrimaryButton>
              </div>
            ) : null}
          </ResidentCard>
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
    <Suspense fallback={<ResidentMuted>טוען…</ResidentMuted>}>
      <PaymentsInner />
    </Suspense>
  )
}
