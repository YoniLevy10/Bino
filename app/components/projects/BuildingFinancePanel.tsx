'use client'

/**
 * Building Hub — Finance tab (Wave 3 Phase 1).
 * Expenses list + create + annual budget vs spend (north-star: עלות תחזוקה לבניין).
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast, errorMessageFromResponseJson } from '@/lib/error-handler'
import {
  computeBudgetUtilization,
  yearElapsedFraction,
} from '@/lib/building-finance/budget-math'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { Button, LoadingSpinner, theme } from '@/app/components/ui'

type ExpenseRow = {
  id: string
  amount: number
  currency: string
  expense_date: string
  vendor_name: string | null
  description: string | null
  payment_status: string
  budget_period_key: string | null
  created_at: string
}

type BudgetRow = {
  id: string
  period_key: string
  amount_planned: number
  currency: string
}

type Props = {
  projectId: string
  projectName: string
  isMobile?: boolean
}

const PAYMENT_LABELS: Record<string, string> = {
  unpaid: 'לא שולם',
  partial: 'חלקי',
  paid: 'שולם',
  void: 'בוטל',
}

function formatIls(n: number): string {
  return `₪${n.toLocaleString('he-IL', { maximumFractionDigits: 2 })}`
}

function todayIsoDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function currentYearKey(): string {
  return String(new Date().getFullYear())
}

export function BuildingFinancePanel({
  projectId,
  projectName,
  isMobile: isMobileProp,
}: Props) {
  const yearKey = currentYearKey()
  const [viewportMobile, setViewportMobile] = useState(false)
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [budget, setBudget] = useState<BudgetRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [locked, setLocked] = useState(false)
  const [lockMessage, setLockMessage] = useState<string | null>(null)
  const [savingExpense, setSavingExpense] = useState(false)
  const [savingBudget, setSavingBudget] = useState(false)

  const [amount, setAmount] = useState('')
  const [vendor, setVendor] = useState('')
  const [description, setDescription] = useState('')
  const [expenseDate, setExpenseDate] = useState(todayIsoDate)
  const [paymentStatus, setPaymentStatus] = useState<'unpaid' | 'partial' | 'paid'>('unpaid')
  const [budgetInput, setBudgetInput] = useState('')

  useEffect(() => {
    if (typeof isMobileProp === 'boolean') return
    const check = () => setViewportMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [isMobileProp])

  const isMobile = typeof isMobileProp === 'boolean' ? isMobileProp : viewportMobile

  const load = useCallback(async () => {
    setLoading(true)
    setLocked(false)
    setLockMessage(null)
    try {
      const [expRes, budRes] = await Promise.all([
        fetchWithTimeout(
          `/api/building-finance/expenses?project_id=${encodeURIComponent(projectId)}&limit=50`
        ),
        fetchWithTimeout(
          `/api/building-finance/budgets?project_id=${encodeURIComponent(projectId)}&period_key=${encodeURIComponent(yearKey)}`
        ),
      ])

      const expJson = (await expRes.json()) as {
        expenses?: ExpenseRow[]
        error?: string
        code?: string
      }
      if (expJson.code === 'FINANCE_PLATFORM_DISABLED') {
        setLocked(true)
        setLockMessage(expJson.error || 'הנהלת חשבונות בניין כבויה כרגע בפלטפורמה')
        setExpenses([])
        setBudget(null)
        return
      }
      if (!expRes.ok) {
        throw new Error(errorMessageFromResponseJson(expJson, `שגיאה ${expRes.status}`))
      }
      setExpenses(expJson.expenses ?? [])

      if (budRes.ok) {
        const budJson = (await budRes.json()) as { budgets?: BudgetRow[] }
        const row = (budJson.budgets ?? [])[0] ?? null
        setBudget(row)
        setBudgetInput(row ? String(row.amount_planned) : '')
      } else {
        setBudget(null)
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינת כספים נכשלה')
      setExpenses([])
      setBudget(null)
    } finally {
      setLoading(false)
    }
  }, [projectId, yearKey])

  useEffect(() => {
    void load()
  }, [load])

  const yearSpend = useMemo(() => {
    return expenses
      .filter((e) => e.expense_date.startsWith(yearKey) || e.budget_period_key === yearKey)
      .reduce((sum, e) => sum + Number(e.amount || 0), 0)
  }, [expenses, yearKey])

  const utilization = useMemo(() => {
    const planned = budget?.amount_planned ?? 0
    return computeBudgetUtilization({
      period_key: yearKey,
      planned,
      spent: yearSpend,
      elapsedFraction: yearElapsedFraction(),
    })
  }, [budget, yearKey, yearSpend])

  async function onCreateExpense(e: FormEvent) {
    e.preventDefault()
    const parsedAmount = Number(amount.replace(/,/g, ''))
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error('סכום לא תקין')
      return
    }
    setSavingExpense(true)
    try {
      const res = await fetchWithTimeout('/api/building-finance/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          amount: parsedAmount,
          expense_date: expenseDate,
          vendor_name: vendor.trim() || null,
          description: description.trim() || null,
          payment_status: paymentStatus,
          budget_period_key: yearKey,
          idempotency_key: `ui-${projectId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        }),
      })
      const json = (await res.json()) as { error?: string; code?: string }
      if (json.code === 'FINANCE_PLATFORM_DISABLED') {
        setLocked(true)
        setLockMessage(json.error || 'הנהלת חשבונות בניין כבויה כרגע בפלטפורמה')
        throw new Error(json.error || 'הנהלת חשבונות כבויה בפלטפורמה')
      }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      toast.success('הוצאה נשמרה')
      setAmount('')
      setVendor('')
      setDescription('')
      setPaymentStatus('unpaid')
      setExpenseDate(todayIsoDate())
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שמירת הוצאה נכשלה')
    } finally {
      setSavingExpense(false)
    }
  }

  async function onSaveBudget(e: FormEvent) {
    e.preventDefault()
    const parsed = Number(budgetInput.replace(/,/g, ''))
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error('תקציב לא תקין')
      return
    }
    setSavingBudget(true)
    try {
      const res = await fetchWithTimeout('/api/building-finance/budgets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          period_key: yearKey,
          amount_planned: parsed,
        }),
      })
      const json = (await res.json()) as { error?: string; code?: string }
      if (json.code === 'FINANCE_PLATFORM_DISABLED') {
        setLocked(true)
        setLockMessage(json.error || 'הנהלת חשבונות בניין כבויה כרגע בפלטפורמה')
        throw new Error(json.error || 'הנהלת חשבונות כבויה בפלטפורמה')
      }
      if (!res.ok) throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      toast.success(`תקציב ${yearKey} עודכן`)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'שמירת תקציב נכשלה')
    } finally {
      setSavingBudget(false)
    }
  }

  if (loading) {
    return (
      <div style={styles.center}>
        <LoadingSpinner />
      </div>
    )
  }

  if (locked) {
    return (
      <div style={styles.lockBox}>
        <p style={styles.lockTitle}>הנהלת חשבונות בניין</p>
        <p style={styles.lockBody}>{lockMessage}</p>
        <p style={styles.lockHint}>
          פיצ׳ר ליבה — נשלט ב־kill-switch של הפלטפורמה (
          <code>BUILDING_FINANCE_ENABLED</code>
          ). אין תוסף בתשלום להפעלה.
        </p>
      </div>
    )
  }

  const inputStyle = {
    ...styles.input,
    ...(isMobile ? styles.inputMobile : null),
  }

  return (
    <div style={styles.root}>
      <p style={styles.intro}>
        כספי בניין ל־<strong>{projectName}</strong> — הוצאות ותקציב שנתי (נפרד מגביית Grow).
      </p>

      <div style={styles.kpiRow}>
        <div style={styles.kpi}>
          <span style={styles.kpiLabel}>הוצאות {yearKey}</span>
          <span style={{ ...styles.kpiValue, color: theme.colors.kpiNegative }}>
            {formatIls(utilization.spent)}
          </span>
        </div>
        <div style={styles.kpi}>
          <span style={styles.kpiLabel}>תקציב מתוכנן</span>
          <span style={styles.kpiValue}>{formatIls(utilization.planned)}</span>
        </div>
        <div style={styles.kpi}>
          <span style={styles.kpiLabel}>יתרה</span>
          <span
            style={{
              ...styles.kpiValue,
              color:
                utilization.remaining < 0 ? theme.colors.kpiNegative : theme.colors.kpiPositive,
            }}
          >
            {formatIls(utilization.remaining)}
          </span>
        </div>
        <div style={styles.kpi}>
          <span style={styles.kpiLabel}>ניצול</span>
          <span style={styles.kpiValue}>
            {utilization.utilization_pct == null ? '—' : `${utilization.utilization_pct}%`}
            {utilization.over_pace ? (
              <span style={styles.paceWarn}> · מעל קצב</span>
            ) : null}
          </span>
        </div>
      </div>

      <form
        onSubmit={onSaveBudget}
        style={{
          ...styles.budgetForm,
          ...(isMobile ? styles.budgetFormMobile : null),
        }}
      >
        <label style={{ ...styles.label, ...(isMobile ? styles.labelMobile : null) }}>
          תקציב שנתי {yearKey} (₪)
          <input
            type="number"
            min={0}
            step="0.01"
            value={budgetInput}
            onChange={(ev) => setBudgetInput(ev.target.value)}
            style={inputStyle}
            placeholder="לדוגמה 120000"
          />
        </label>
        <Button
          type="submit"
          variant="secondary"
          disabled={savingBudget}
          style={isMobile ? styles.fullBtn : undefined}
        >
          {savingBudget ? 'שומר…' : 'שמור תקציב'}
        </Button>
      </form>

      <form onSubmit={onCreateExpense} style={styles.expenseForm}>
        <p style={styles.sectionTitle}>הוצאה חדשה</p>
        <div
          style={{
            ...styles.formGrid,
            ...(isMobile ? styles.formGridMobile : null),
          }}
        >
          <label style={{ ...styles.label, ...(isMobile ? styles.labelMobile : null) }}>
            סכום (₪)
            <input
              required
              type="number"
              min={0.01}
              step="0.01"
              value={amount}
              onChange={(ev) => setAmount(ev.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ ...styles.label, ...(isMobile ? styles.labelMobile : null) }}>
            תאריך
            <input
              required
              type="date"
              value={expenseDate}
              onChange={(ev) => setExpenseDate(ev.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ ...styles.label, ...(isMobile ? styles.labelMobile : null) }}>
            ספק / נותן שירות
            <input
              type="text"
              value={vendor}
              onChange={(ev) => setVendor(ev.target.value)}
              style={inputStyle}
              maxLength={200}
            />
          </label>
          <label style={{ ...styles.label, ...(isMobile ? styles.labelMobile : null) }}>
            סטטוס תשלום
            <select
              value={paymentStatus}
              onChange={(ev) =>
                setPaymentStatus(ev.target.value as 'unpaid' | 'partial' | 'paid')
              }
              style={inputStyle}
            >
              <option value="unpaid">לא שולם</option>
              <option value="partial">חלקי</option>
              <option value="paid">שולם</option>
            </select>
          </label>
        </div>
        <label style={{ ...styles.label, ...(isMobile ? styles.labelMobile : null) }}>
          תיאור
          <input
            type="text"
            value={description}
            onChange={(ev) => setDescription(ev.target.value)}
            style={inputStyle}
            maxLength={2000}
            placeholder="למשל: ניקיון חודשי / תיקון מעלית"
          />
        </label>
        <Button
          type="submit"
          variant="primary"
          disabled={savingExpense}
          style={isMobile ? styles.fullBtn : undefined}
        >
          {savingExpense ? 'שומר…' : 'הוסף הוצאה'}
        </Button>
      </form>

      <div
        style={{
          ...styles.listHeader,
          ...(isMobile ? styles.listHeaderMobile : null),
        }}
      >
        <p style={styles.sectionTitle}>הוצאות אחרונות</p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void load()}
          style={isMobile ? styles.fullBtn : undefined}
        >
          רענון
        </Button>
      </div>

      {expenses.length === 0 ? (
        <p style={styles.empty}>אין הוצאות עדיין — הוסיפו את הראשונה למעלה.</p>
      ) : (
        <ul style={styles.list}>
          {expenses.map((row) => (
            <li
              key={row.id}
              style={{
                ...styles.listItem,
                ...(isMobile ? styles.listItemMobile : null),
              }}
            >
              <div style={styles.listMain}>
                <span style={styles.listAmount}>{formatIls(Number(row.amount))}</span>
                <span style={styles.listMeta}>
                  {row.expense_date}
                  {row.vendor_name ? ` · ${row.vendor_name}` : ''}
                </span>
                {row.description ? (
                  <span style={styles.listDesc}>{row.description}</span>
                ) : null}
              </div>
              <span
                style={{
                  ...styles.statusPill,
                  background:
                    row.payment_status === 'paid'
                      ? theme.colors.paymentPaidMuted
                      : row.payment_status === 'partial'
                        ? theme.colors.paymentPartialMuted
                        : theme.colors.paymentPendingMuted,
                  color:
                    row.payment_status === 'paid'
                      ? theme.colors.paymentPaid
                      : row.payment_status === 'partial'
                        ? theme.colors.paymentPartial
                        : theme.colors.paymentPending,
                }}
              >
                {PAYMENT_LABELS[row.payment_status] || row.payment_status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const styles: Record<string, CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.md,
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    overflowX: 'clip',
    boxSizing: 'border-box',
  },
  center: {
    display: 'flex',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  intro: {
    margin: 0,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
    lineHeight: 1.45,
  },
  kpiRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: theme.spacing.sm,
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
  },
  kpi: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.borderSubtle}`,
    background: theme.colors.surface,
    minWidth: 0,
    maxWidth: '100%',
    overflowWrap: 'anywhere',
  },
  kpiLabel: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textMuted,
    fontWeight: theme.typography.fontWeight.medium,
  },
  kpiValue: {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  paceWarn: {
    color: theme.colors.kpiNegative,
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  budgetForm: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: theme.spacing.sm,
  },
  budgetFormMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  expenseForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.blueSoft,
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: theme.spacing.sm,
    width: '100%',
    minWidth: 0,
  },
  formGridMobile: {
    gridTemplateColumns: '1fr',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textSecondary,
    flex: 1,
    minWidth: 120,
  },
  labelMobile: {
    minWidth: 0,
    width: '100%',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    minHeight: 44,
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surfaceElevated,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.fontSize.sm,
    fontFamily: 'inherit',
  },
  inputMobile: {
    fontSize: 16,
    minHeight: 48,
  },
  fullBtn: {
    width: '100%',
    minHeight: 48,
  },
  sectionTitle: {
    margin: 0,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  listHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  listHeaderMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  empty: {
    margin: 0,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textMuted,
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
  },
  listItem: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.borderSubtle}`,
    background: theme.colors.surface,
  },
  listItemMobile: {
    flexWrap: 'wrap' as const,
  },
  listMain: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 0,
    flex: 1,
  },
  listAmount: {
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  listMeta: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textMuted,
  },
  listDesc: {
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  statusPill: {
    flexShrink: 0,
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    padding: '4px 8px',
    borderRadius: theme.radius.sm,
  },
  lockBox: {
    padding: theme.spacing.lg,
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
  },
  lockTitle: {
    margin: 0,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  lockBody: {
    margin: 0,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSize.sm,
  },
  lockHint: {
    margin: 0,
    color: theme.colors.textMuted,
    fontSize: theme.typography.fontSize.xs,
    lineHeight: 1.45,
  },
}
