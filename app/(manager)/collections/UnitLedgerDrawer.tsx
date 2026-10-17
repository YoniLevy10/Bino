'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { toast, asyncHandler, errorMessageFromResponseJson } from '@/lib/error-handler'
import {
  fetchWithTimeout,
  MUTATION_FETCH_TIMEOUT_MS,
  DEFAULT_FETCH_TIMEOUT_MS,
} from '@/lib/fetch-with-timeout'
import { formatChargeAmountIls, type CollectionChargeListItem } from '@/lib/collection-charges'
import { Button, Drawer, Select, theme } from '@/app/components/ui'

type LedgerEntryView = {
  id: string
  entry_type: string
  amount: number
  signed_amount: number
  period_label: string | null
  description: string | null
  payment_method: string | null
  receipt_note: string | null
  charge_id: string | null
  created_at: string
  running_balance: number
  amount_label?: string
  running_balance_label?: string
}

type LedgerResponse = {
  unit_id: string | null
  resident_id: string | null
  project_id: string | null
  unit_label: string | null
  resident_name: string | null
  balance: number
  debt: number
  credit: number
  balance_kind: 'debt' | 'credit' | 'zero'
  entries: LedgerEntryView[]
  error?: string
}

const ENTRY_TYPE_LABELS: Record<string, string> = {
  charge: 'חיוב',
  payment: 'תשלום',
  credit: 'זיכוי',
  reversal: 'ביטול',
}

const METHOD_OPTIONS = [
  { label: 'העברה', value: 'transfer' },
  { label: 'מזומן', value: 'cash' },
  { label: 'צ׳ק', value: 'check' },
  { label: 'אחר', value: 'other' },
]

function formatDateHe(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

export function UnitLedgerDrawer(props: {
  open: boolean
  onClose: () => void
  isMobile: boolean
  charge: CollectionChargeListItem | null
  onChanged: () => void | Promise<void>
}) {
  const { open, onClose, isMobile, charge, onChanged } = props
  const [loading, setLoading] = useState(false)
  const [ledger, setLedger] = useState<LedgerResponse | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('transfer')
  const [payNote, setPayNote] = useState('')
  const [paying, setPaying] = useState(false)
  const [creditAmount, setCreditAmount] = useState('')
  const [creditNote, setCreditNote] = useState('')
  const [crediting, setCrediting] = useState(false)

  const loadLedger = useCallback(async () => {
    if (!charge?.resident_id && !charge?.unit_id) return
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (charge.unit_id) params.set('unit_id', charge.unit_id)
      if (charge.resident_id) params.set('resident_id', charge.resident_id)
      if (charge.project_id) params.set('project_id', charge.project_id)
      const res = await fetchWithTimeout(
        `/api/collections/ledger?${params.toString()}`,
        {},
        Math.max(DEFAULT_FETCH_TIMEOUT_MS, 15_000)
      )
      const body = (await res.json().catch(() => ({}))) as LedgerResponse
      if (!res.ok) {
        throw new Error(errorMessageFromResponseJson(body, 'טעינת כרטסת נכשלה'))
      }
      setLedger(body)
    } catch (e) {
      setLedger(null)
      toast.error(e instanceof Error ? e.message : 'טעינת כרטסת נכשלה')
    } finally {
      setLoading(false)
    }
  }, [charge])

  useEffect(() => {
    if (!open || !charge) {
      setLedger(null)
      setPayAmount('')
      setPayNote('')
      setCreditAmount('')
      setCreditNote('')
      return
    }
    void loadLedger()
  }, [open, charge, loadLedger])

  const canPartialPay =
    charge &&
    charge.status !== 'paid' &&
    charge.status !== 'cancelled' &&
    charge.status !== 'draft'

  async function submitPartialPay() {
    if (!charge) return
    const amount = Number(payAmount)
    if (!(amount > 0)) {
      toast.error('הזינו סכום חיובי')
      return
    }
    setPaying(true)
    try {
      await asyncHandler(async () => {
        const res = await fetchWithTimeout(
          '/api/collections/ledger/payment',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              charge_id: charge.id,
              amount,
              payment_method: payMethod,
              receipt_note: payNote.trim() || null,
            }),
          },
          MUTATION_FETCH_TIMEOUT_MS
        )
        const json = (await res.json().catch(() => ({}))) as {
          error?: string
          fully_paid?: boolean
          remaining?: number
        }
        if (!res.ok) throw new Error(errorMessageFromResponseJson(json, 'רישום תשלום נכשל'))
        toast.success(
          json.fully_paid
            ? 'התשלום נרשם והחיוב סומן כשולם'
            : `תשלום חלקי נרשם · נותר ${formatChargeAmountIls(Number(json.remaining ?? 0))}`
        )
        setPayAmount('')
        setPayNote('')
        await loadLedger()
        await onChanged()
        return true
      })
    } finally {
      setPaying(false)
    }
  }

  async function submitCredit() {
    if (!charge?.project_id) return
    const amount = Number(creditAmount)
    if (!(amount > 0)) {
      toast.error('הזינו סכום זיכוי חיובי')
      return
    }
    setCrediting(true)
    try {
      await asyncHandler(async () => {
        const res = await fetchWithTimeout(
          '/api/collections/ledger/credit',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              project_id: charge.project_id,
              unit_id: charge.unit_id || null,
              resident_id: charge.resident_id || null,
              amount,
              description: 'יתרת זכות',
              receipt_note: creditNote.trim() || null,
            }),
          },
          MUTATION_FETCH_TIMEOUT_MS
        )
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        if (!res.ok) throw new Error(errorMessageFromResponseJson(json, 'רישום זיכוי נכשל'))
        toast.success('יתרת זכות נרשמה בכרטסת')
        setCreditAmount('')
        setCreditNote('')
        await loadLedger()
        await onChanged()
        return true
      })
    } finally {
      setCrediting(false)
    }
  }

  const titleName =
    ledger?.resident_name ||
    charge?.residents?.full_name ||
    'דייר'
  const unitPart =
    ledger?.unit_label ||
    (charge?.residents?.apartment_number
      ? `דירה ${charge.residents.apartment_number}`
      : '')

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`כרטסת · ${titleName}${unitPart ? ` · ${unitPart}` : ''}`}
      isMobile={isMobile}
      footer={
        <div style={styles.footer}>
          <Button variant="secondary" onClick={onClose}>
            סגור
          </Button>
        </div>
      }
    >
      {loading && !ledger ? (
        <p style={styles.hint}>טוען כרטסת…</p>
      ) : !ledger ? (
        <p style={styles.hint}>אין נתוני כרטסת להצגה.</p>
      ) : (
        <div style={styles.body}>
          <div style={styles.balanceBox}>
            <div style={styles.balanceLabel}>
              {ledger.balance_kind === 'debt'
                ? 'יתרת חוב'
                : ledger.balance_kind === 'credit'
                  ? 'יתרת זכות'
                  : 'יתרה מאוזנת'}
            </div>
            <div
              style={{
                ...styles.balanceAmount,
                color:
                  ledger.balance_kind === 'debt'
                    ? '#b91c1c'
                    : ledger.balance_kind === 'credit'
                      ? '#15803d'
                      : theme.colors.textPrimary,
              }}
            >
              {formatChargeAmountIls(Math.abs(ledger.balance))}
            </div>
          </div>

          {canPartialPay ? (
            <div style={styles.formBlock}>
              <div style={styles.sectionTitle}>תשלום חלקי על חיוב זה</div>
              <div style={styles.hint}>
                {charge.title}
                {charge.period_label ? ` · ${charge.period_label}` : ''} ·{' '}
                {formatChargeAmountIls(Number(charge.amount))}
              </div>
              <label style={styles.label}>סכום ששולם</label>
              <input
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                inputMode="decimal"
                placeholder="למשל 150"
                style={styles.input}
              />
              <label style={styles.label}>אמצעי תשלום</label>
              <Select
                value={payMethod}
                onChange={setPayMethod}
                options={METHOD_OPTIONS}
                style={{ width: '100%' }}
              />
              <label style={styles.label}>אסמכתה / הערה (אופציונלי)</label>
              <input
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                placeholder="מספר העברה / צ׳ק"
                style={styles.input}
              />
              <Button disabled={paying} onClick={() => void submitPartialPay()}>
                {paying ? 'רושם…' : 'רשום תשלום'}
              </Button>
            </div>
          ) : null}

          <div style={styles.formBlock}>
            <div style={styles.sectionTitle}>יתרת זכות</div>
            <label style={styles.label}>סכום זיכוי</label>
            <input
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              inputMode="decimal"
              placeholder="למשל 50"
              style={styles.input}
            />
            <label style={styles.label}>הערה (אופציונלי)</label>
            <input
              value={creditNote}
              onChange={(e) => setCreditNote(e.target.value)}
              placeholder="סיבת הזיכוי"
              style={styles.input}
            />
            <Button
              variant="secondary"
              disabled={crediting || !charge?.project_id}
              onClick={() => void submitCredit()}
            >
              {crediting ? 'רושם…' : 'רשום זיכוי'}
            </Button>
          </div>

          <div style={styles.sectionTitle}>תנועות</div>
          {ledger.entries.length === 0 ? (
            <p style={styles.hint}>עדיין אין תנועות בכרטסת.</p>
          ) : (
            <div style={styles.entryList}>
              {[...ledger.entries].reverse().map((e) => {
                const isDebt = e.signed_amount > 0
                return (
                  <div key={e.id} style={styles.entryRow}>
                    <div style={styles.entryMain}>
                      <div style={styles.entryType}>
                        {ENTRY_TYPE_LABELS[e.entry_type] || e.entry_type}
                        {e.period_label ? ` · ${e.period_label}` : ''}
                      </div>
                      <div style={styles.entryDesc}>
                        {e.description || '—'}
                        {e.payment_method ? ` · ${e.payment_method}` : ''}
                        {e.receipt_note ? ` · ${e.receipt_note}` : ''}
                      </div>
                      <div style={styles.entryDate}>{formatDateHe(e.created_at)}</div>
                    </div>
                    <div style={styles.entryMoney}>
                      <div
                        style={{
                          ...styles.entryAmount,
                          color: isDebt ? '#b91c1c' : '#15803d',
                        }}
                      >
                        {isDebt ? '+' : '−'}
                        {formatChargeAmountIls(Number(e.amount))}
                      </div>
                      <div style={styles.entryRunning}>
                        יתרה {formatChargeAmountIls(Math.abs(e.running_balance))}
                        {e.running_balance < 0 ? ' זכות' : e.running_balance > 0 ? ' חוב' : ''}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </Drawer>
  )
}

const styles: Record<string, CSSProperties> = {
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
  },
  balanceBox: {
    padding: '14px 16px',
    borderRadius: 14,
    border: `1px solid ${theme.colors.border}`,
    background: '#f8fafc',
  },
  balanceLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: theme.colors.textSecondary,
  },
  balanceAmount: {
    marginTop: 4,
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  formBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: '12px 0',
    borderTop: `1px solid ${theme.colors.border}`,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  label: {
    fontSize: 13,
    fontWeight: 600,
    color: theme.colors.textSecondary,
  },
  input: {
    padding: '12px 14px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    fontSize: 15,
    color: theme.colors.textPrimary,
    width: '100%',
    boxSizing: 'border-box',
  },
  hint: {
    margin: 0,
    fontSize: 13,
    color: theme.colors.textMuted,
  },
  entryList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  entryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 10,
    padding: '10px 12px',
    borderRadius: 12,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
  },
  entryMain: { minWidth: 0, flex: 1 },
  entryType: {
    fontSize: 14,
    fontWeight: 700,
    color: theme.colors.textPrimary,
  },
  entryDesc: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
    lineHeight: 1.35,
  },
  entryDate: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  entryMoney: {
    textAlign: 'left',
    flexShrink: 0,
  },
  entryAmount: {
    fontSize: 15,
    fontWeight: 800,
  },
  entryRunning: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
}
