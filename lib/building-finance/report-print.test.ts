import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildReportPrintHtml,
  openBrandedReportPrint,
  REPORT_PRINT_FOOTER,
  resolveReportPrintLogoUrl,
  type ReportPrintPayload,
} from '@/lib/building-finance/report-print'

function samplePayload(overrides: Partial<ReportPrintPayload> = {}): ReportPrintPayload {
  return {
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
    ...overrides,
  }
}

describe('report-print', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('embeds client logo and exact OpsBrain footer', () => {
    const html = buildReportPrintHtml(samplePayload())

    expect(REPORT_PRINT_FOOTER).toBe('Bino - By OpsBrain')
    expect(html).toContain('https://cdn.example.com/logo.png')
    expect(html).toContain('ועד בדיקה')
    expect(html).toContain('מגדל הים')
    expect(html).toContain(`>${REPORT_PRINT_FOOTER}<`)
    expect(html).toContain('dir="rtl"')
  })

  it('resolveReportPrintLogoUrl absolutizes relative paths for about:blank', () => {
    expect(resolveReportPrintLogoUrl(null, 'https://bino.casa')).toBe(
      'https://bino.casa/bino-mark.png'
    )
    expect(resolveReportPrintLogoUrl('/custom.png', 'https://bino.casa')).toBe(
      'https://bino.casa/custom.png'
    )
    expect(resolveReportPrintLogoUrl('https://cdn.example.com/a.png', 'https://bino.casa')).toBe(
      'https://cdn.example.com/a.png'
    )
  })

  it('openBrandedReportPrint writes HTML when window.open returns a window', () => {
    const written: string[] = []
    const popup = {
      opener: {} as Window | null,
      document: {
        readyState: 'complete' as DocumentReadyState,
        open: vi.fn(),
        write: (html: string) => {
          written.push(html)
        },
        close: vi.fn(),
      },
      focus: vi.fn(),
      print: vi.fn(),
      addEventListener: vi.fn(),
    }
    const open = vi.fn(
      (_url?: string | URL, _target?: string, _features?: string) => popup
    )
    vi.stubGlobal('window', {
      open,
      location: { origin: 'https://bino.casa' },
    })

    const ok = openBrandedReportPrint(samplePayload({ logoUrl: null }))

    expect(ok).toBe(true)
    expect(open).toHaveBeenCalledWith('', '_blank', 'width=960,height=720')
    const features = String(open.mock.calls[0]?.[2] ?? '')
    expect(features).not.toMatch(/noopener/)
    expect(features).not.toMatch(/noreferrer/)
    expect(popup.opener).toBeNull()
    expect(written[0]).toContain('https://bino.casa/bino-mark.png')
    expect(written[0]).toContain(REPORT_PRINT_FOOTER)
  })

  it('openBrandedReportPrint returns false when popup is blocked', () => {
    vi.stubGlobal('window', {
      open: vi.fn(() => null),
      location: { origin: 'https://bino.casa' },
    })
    expect(openBrandedReportPrint(samplePayload())).toBe(false)
  })
})
