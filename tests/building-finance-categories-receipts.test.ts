import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BUILDING_EXPENSE_CATEGORIES,
  categoryKeyFromName,
} from '@/lib/building-finance/default-categories'
import {
  decodeReceiptStoragePath,
  encodeReceiptStoragePath,
  isExternalReceiptUrl,
  safeReceiptFileName,
} from '@/lib/building-finance/receipt-storage'
import { createBuildingExpenseBodySchema } from '@/lib/api-body-schemas'
import { buildReportPrintHtml } from '@/lib/building-finance/report-print'

describe('default expense categories', () => {
  it('includes the core Hebrew system set', () => {
    const keys = DEFAULT_BUILDING_EXPENSE_CATEGORIES.map((c) => c.key)
    expect(keys).toContain('cleaning')
    expect(keys).toContain('elevator')
    expect(keys).toContain('other')
    expect(DEFAULT_BUILDING_EXPENSE_CATEGORIES.every((c) => c.name_he.length > 0)).toBe(true)
  })

  it('builds ascii keys from latin names and fallbacks for Hebrew', () => {
    expect(categoryKeyFromName('Cleaning Extra')).toBe('cleaning_extra')
    expect(categoryKeyFromName('איטום', 'abc123')).toMatch(/^cat_abc123$/)
  })
})

describe('receipt storage paths', () => {
  it('encodes and decodes storage paths', () => {
    expect(encodeReceiptStoragePath('c/p/file.pdf')).toBe('storage:c/p/file.pdf')
    expect(encodeReceiptStoragePath('storage:c/p/file.pdf')).toBe('storage:c/p/file.pdf')
    expect(decodeReceiptStoragePath('storage:c/p/file.pdf')).toBe('c/p/file.pdf')
    expect(decodeReceiptStoragePath('https://example.com/r.pdf')).toBeNull()
  })

  it('detects external URLs', () => {
    expect(isExternalReceiptUrl('https://cdn.example/r.pdf')).toBe(true)
    expect(isExternalReceiptUrl('storage:x/y.pdf')).toBe(false)
  })

  it('sanitizes file names', () => {
    expect(safeReceiptFileName('קבלה 01.pdf')).toContain('pdf')
    expect(safeReceiptFileName('a/b\\c?.pdf')).not.toMatch(/[\\/?]/)
  })
})

describe('createBuildingExpenseBodySchema ticket + receipt', () => {
  it('accepts ticket_id and storage receipt path', () => {
    const parsed = createBuildingExpenseBodySchema.safeParse({
      project_id: '00000000-0000-4000-8000-000000000001',
      amount: 120,
      ticket_id: '00000000-0000-4000-8000-000000000002',
      receipt_url: 'storage:client/project/receipt.pdf',
      idempotency_key: 'ui-test-key-12345',
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects invalid receipt_url shapes', () => {
    const parsed = createBuildingExpenseBodySchema.safeParse({
      project_id: '00000000-0000-4000-8000-000000000001',
      amount: 120,
      receipt_url: 'not-a-url-or-storage',
      idempotency_key: 'ui-test-key-12345',
    })
    expect(parsed.success).toBe(false)
  })
})

describe('report print four blocks', () => {
  it('renders הכנסות / חובות / הוצאות / תזרים', () => {
    const html = buildReportPrintHtml({
      projectName: 'בניין בדיקה',
      clientName: 'Bino',
      logoUrl: null,
      periodLabel: '2026',
      periodRange: '2026-01-01–2026-12-31',
      kpi: {
        spent: 5000,
        planned: 10000,
        remaining: 5000,
        utilization_pct: 50,
        over_pace: false,
        previous_spent: 4000,
        previous_period_key: '2025',
        spend_delta: 1000,
        spend_delta_pct: 25,
      },
      grow: { collected: 8000, outstanding: 1500, net_vs_expenses: 3000 },
      statement: {
        income: 8000,
        debts: 1500,
        expenses: 5000,
        cashflow: 3000,
        income_available: true,
        basis_label_he: 'בסיס רשום',
      },
      pnl: { expenses_total: 5000, income_grow_collected: 8000, net: 3000 },
      byCategory: [],
      byPaymentStatus: [],
      byVendor: [],
      lines: [],
      truncated: false,
      rowCount: 0,
    })
    expect(html).toContain('הכנסות')
    expect(html).toContain('חובות')
    expect(html).toContain('הוצאות')
    expect(html).toContain('תזרים')
    expect(html).toContain('בסיס רשום')
  })
})
