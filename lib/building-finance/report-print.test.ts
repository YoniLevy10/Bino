import { describe, expect, it } from 'vitest'
import { buildReportPrintHtml, REPORT_PRINT_FOOTER } from '@/lib/building-finance/report-print'

describe('report-print', () => {
  it('embeds client logo and exact OpsBrain footer', () => {
    const html = buildReportPrintHtml({
      projectName: 'מגדל הים',
      clientName: 'ועד בדיקה',
      logoUrl: 'https://cdn.example.com/logo.png',
      periodLabel: '2026',
      periodRange: '2026-01-01–2026-12-31',
      kpi: {
        spent: 1000,
        planned: 2000,
        remaining: 1000,
        utilization_pct: 50,
        over_pace: false,
        previous_spent: 800,
        previous_period_key: '2025',
        spend_delta: 200,
        spend_delta_pct: 25,
      },
      grow: null,
      pnl: {
        expenses_total: 1000,
        income_grow_collected: null,
        net: null,
      },
      byCategory: [{ label: 'חשמל', amount: 1000, count: 1, pct: 100 }],
      byPaymentStatus: [{ label: 'שולם', amount: 1000, count: 1, pct: 100 }],
      byVendor: [],
      lines: [
        {
          expense_date: '2026-03-01',
          amount: 1000,
          vendor_name: 'ספק',
          description: 'תיקון',
          payment_status: 'paid',
          category_label: 'חשמל',
        },
      ],
      truncated: false,
      rowCount: 1,
    })

    expect(REPORT_PRINT_FOOTER).toBe('Bino - By OpsBrain')
    expect(html).toContain('https://cdn.example.com/logo.png')
    expect(html).toContain('ועד בדיקה')
    expect(html).toContain('מגדל הים')
    expect(html).toContain(`>${REPORT_PRINT_FOOTER}<`)
    expect(html).toContain('dir="rtl"')
  })
})
