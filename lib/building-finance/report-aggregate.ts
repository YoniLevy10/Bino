import { roundMoney } from '@/lib/unit-ledger'
import type { BuildingExpensePaymentStatus } from '@/lib/building-finance/types'

export type ReportExpenseInput = {
  amount: number | string
  category_id: string | null
  vendor_name: string | null
  payment_status: string
  expense_date: string
  description: string | null
}

export type ReportBucket = {
  key: string
  label: string
  amount: number
  count: number
  pct: number
}

export type ReportExpenseLine = {
  expense_date: string
  amount: number
  vendor_name: string | null
  description: string | null
  payment_status: string
  category_label: string
}

const PAYMENT_LABELS: Record<string, string> = {
  unpaid: 'לא שולם',
  partial: 'חלקי',
  paid: 'שולם',
  void: 'בוטל',
}

function toAmount(v: number | string): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? roundMoney(Math.max(0, n)) : 0
}

function pushBucket(
  map: Map<string, { label: string; amount: number; count: number }>,
  key: string,
  label: string,
  amount: number
) {
  const prev = map.get(key)
  if (prev) {
    prev.amount = roundMoney(prev.amount + amount)
    prev.count += 1
  } else {
    map.set(key, { label, amount, count: 1 })
  }
}

function finalizeBuckets(
  map: Map<string, { label: string; amount: number; count: number }>,
  total: number
): ReportBucket[] {
  return [...map.entries()]
    .map(([key, v]) => ({
      key,
      label: v.label,
      amount: v.amount,
      count: v.count,
      pct: total > 0 ? roundMoney((v.amount / total) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
}

export function aggregateBuildingReport(opts: {
  expenses: ReportExpenseInput[]
  categoryNames: Record<string, string>
  /** Max P&L lines returned (newest first). */
  lineLimit?: number
}): {
  spent: number
  by_category: ReportBucket[]
  by_payment_status: ReportBucket[]
  by_vendor: ReportBucket[]
  lines: ReportExpenseLine[]
  truncated: boolean
} {
  const lineLimit = opts.lineLimit ?? 100
  const categoryMap = new Map<string, { label: string; amount: number; count: number }>()
  const paymentMap = new Map<string, { label: string; amount: number; count: number }>()
  const vendorMap = new Map<string, { label: string; amount: number; count: number }>()

  let spent = 0
  const lines: ReportExpenseLine[] = []

  for (const row of opts.expenses) {
    const amount = toAmount(row.amount)
    spent = roundMoney(spent + amount)

    const catId = row.category_id
    const catLabel =
      catId && opts.categoryNames[catId] ? opts.categoryNames[catId] : 'ללא קטגוריה'
    pushBucket(categoryMap, catId || 'uncategorized', catLabel, amount)

    const status = (row.payment_status || 'unpaid') as BuildingExpensePaymentStatus
    pushBucket(
      paymentMap,
      status,
      PAYMENT_LABELS[status] || status,
      amount
    )

    const vendorKey = (row.vendor_name || '').trim() || 'unknown'
    const vendorLabel = vendorKey === 'unknown' ? 'ללא ספק' : vendorKey
    pushBucket(vendorMap, vendorKey.toLowerCase(), vendorLabel, amount)

    lines.push({
      expense_date: row.expense_date,
      amount,
      vendor_name: row.vendor_name,
      description: row.description,
      payment_status: status,
      category_label: catLabel,
    })
  }

  lines.sort((a, b) => (a.expense_date < b.expense_date ? 1 : a.expense_date > b.expense_date ? -1 : 0))
  const truncated = lines.length > lineLimit

  return {
    spent,
    by_category: finalizeBuckets(categoryMap, spent),
    by_payment_status: finalizeBuckets(paymentMap, spent),
    by_vendor: finalizeBuckets(vendorMap, spent).slice(0, 25),
    lines: lines.slice(0, lineLimit),
    truncated,
  }
}
