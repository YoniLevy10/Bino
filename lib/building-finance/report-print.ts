/**
 * Branded print/PDF export for building finance reports.
 * Opens a print-ready RTL HTML document (letterhead + tables + footer).
 */

export const REPORT_PRINT_FOOTER = 'Bino - By OpsBrain'

export type ReportPrintBucket = {
  label: string
  amount: number
  count: number
  pct: number
}

export type ReportPrintLine = {
  expense_date: string
  amount: number
  vendor_name: string | null
  description: string | null
  payment_status: string
  category_label: string
}

export type ReportPrintPayload = {
  projectName: string
  clientName: string
  logoUrl: string | null
  periodLabel: string
  periodRange: string
  kpi: {
    spent: number
    planned: number
    remaining: number
    utilization_pct: number | null
    over_pace: boolean
    previous_spent: number
    previous_period_key: string
    spend_delta: number
    spend_delta_pct: number | null
  }
  grow: {
    collected: number
    outstanding: number
    net_vs_expenses: number | null
  } | null
  pnl: {
    expenses_total: number
    income_grow_collected: number | null
    net: number | null
  }
  byCategory: ReportPrintBucket[]
  byPaymentStatus: ReportPrintBucket[]
  byVendor: ReportPrintBucket[]
  lines: ReportPrintLine[]
  truncated: boolean
  rowCount: number
}

const PAYMENT_LABELS: Record<string, string> = {
  unpaid: 'לא שולם',
  partial: 'חלקי',
  paid: 'שולם',
  void: 'בוטל',
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatIls(n: number): string {
  return `₪${n.toLocaleString('he-IL', { maximumFractionDigits: 2 })}`
}

function bucketRows(buckets: ReportPrintBucket[]): string {
  if (buckets.length === 0) {
    return `<tr><td colspan="4" class="muted">אין נתונים</td></tr>`
  }
  return buckets
    .map(
      (b) => `<tr>
      <td>${esc(b.label)}</td>
      <td class="num">${b.count}</td>
      <td class="num">${esc(formatIls(b.amount))}</td>
      <td class="num">${b.pct}%</td>
    </tr>`
    )
    .join('')
}

function lineRows(lines: ReportPrintLine[]): string {
  if (lines.length === 0) {
    return `<tr><td colspan="6" class="muted">אין הוצאות בתקופה זו.</td></tr>`
  }
  return lines
    .map((line) => {
      const status = PAYMENT_LABELS[line.payment_status] || line.payment_status
      return `<tr>
      <td>${esc(line.expense_date)}</td>
      <td class="num">${esc(formatIls(line.amount))}</td>
      <td>${esc(line.vendor_name || '—')}</td>
      <td>${esc(line.category_label)}</td>
      <td>${esc(status)}</td>
      <td>${esc(line.description || '')}</td>
    </tr>`
    })
    .join('')
}

/** Resolve logo for about:blank print windows (relative /paths would not load). */
export function resolveReportPrintLogoUrl(
  logoUrl: string | null | undefined,
  origin: string = typeof window !== 'undefined' ? window.location.origin : ''
): string {
  const trimmed = logoUrl?.trim()
  if (trimmed) {
    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('data:')) return trimmed
    if (trimmed.startsWith('/') && origin) return `${origin.replace(/\/$/, '')}${trimmed}`
    return trimmed
  }
  return origin ? `${origin.replace(/\/$/, '')}/bino-mark.png` : '/bino-mark.png'
}

export function buildReportPrintHtml(payload: ReportPrintPayload): string {
  const logoSrc = resolveReportPrintLogoUrl(payload.logoUrl)
  const logo = `<img class="logo" src="${esc(logoSrc)}" alt="" />`
  const util =
    payload.kpi.utilization_pct == null ? '—' : `${payload.kpi.utilization_pct}%`
  const deltaPct =
    payload.kpi.spend_delta_pct != null
      ? ` (${payload.kpi.spend_delta_pct > 0 ? '+' : ''}${payload.kpi.spend_delta_pct}%)`
      : ''
  const growBlock = payload.grow
    ? `<section>
        <h2>גבייה (Grow)</h2>
        <div class="kpi-grid">
          <div class="kpi"><span class="kpi-l">נגבה</span><span class="kpi-v pos">${esc(formatIls(payload.grow.collected))}</span></div>
          <div class="kpi"><span class="kpi-l">פתוח</span><span class="kpi-v">${esc(formatIls(payload.grow.outstanding))}</span></div>
          <div class="kpi"><span class="kpi-l">נטו מול הוצאות</span><span class="kpi-v">${esc(formatIls(payload.grow.net_vs_expenses ?? 0))}</span></div>
        </div>
      </section>`
    : ''
  const incomeRow =
    payload.pnl.income_grow_collected != null
      ? `<tr><td>הכנסות גבייה (Grow)</td><td class="num pos">${esc(formatIls(payload.pnl.income_grow_collected))}</td></tr>`
      : ''
  const netRow =
    payload.pnl.net != null
      ? `<tr class="net"><td>נטו לתקופה</td><td class="num">${esc(formatIls(payload.pnl.net))}</td></tr>`
      : ''
  const truncatedNote = payload.truncated
    ? `<p class="muted">מוצגות שורות מוגבלות (${payload.rowCount})</p>`
    : ''

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>דוח — ${esc(payload.projectName)} — ${esc(payload.periodLabel)}</title>
  <style>
    @page { margin: 14mm 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Assistant", "Heebo", "Segoe UI", Arial, sans-serif;
      color: #0f172a;
      background: #fff;
      font-size: 12px;
      line-height: 1.45;
    }
    .letterhead {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 12px;
      border-bottom: 2px solid #0f172a;
      margin-bottom: 16px;
    }
    .letterhead-main { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .logo { width: 56px; height: 56px; object-fit: contain; border-radius: 8px; }
    .client-name { font-size: 18px; font-weight: 700; margin: 0; }
    .report-title { margin: 2px 0 0; font-size: 13px; color: #475569; font-weight: 600; }
    .meta { text-align: left; color: #64748b; font-size: 11px; white-space: nowrap; }
    h2 {
      margin: 18px 0 8px;
      font-size: 13px;
      font-weight: 700;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
    }
    .kpi {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px;
      background: #f8fafc;
    }
    .kpi-l { display: block; font-size: 10px; color: #64748b; margin-bottom: 4px; }
    .kpi-v { font-size: 15px; font-weight: 700; }
    .pos { color: #15803d; }
    .neg { color: #b91c1c; }
    .muted { color: #64748b; font-size: 11px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 4px;
    }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 6px 8px;
      text-align: right;
      vertical-align: top;
    }
    th {
      background: #f1f5f9;
      font-size: 11px;
      font-weight: 700;
    }
    td.num, th.num { text-align: left; font-variant-numeric: tabular-nums; }
    tr.net td { font-weight: 700; background: #f8fafc; }
    .footer {
      margin-top: 28px;
      padding-top: 10px;
      border-top: 1px solid #cbd5e1;
      text-align: center;
      font-size: 11px;
      color: #475569;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .kpi, th, tr.net td { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      a { color: inherit; text-decoration: none; }
    }
  </style>
</head>
<body>
  <header class="letterhead">
    <div class="letterhead-main">
      ${logo}
      <div>
        <p class="client-name">${esc(payload.clientName)}</p>
        <p class="report-title">דוח הנהלת חשבונות — ${esc(payload.projectName)}</p>
      </div>
    </div>
    <div class="meta">
      <div>${esc(payload.periodLabel)}</div>
      <div>${esc(payload.periodRange)}</div>
    </div>
  </header>

  <section>
    <h2>מדדים עיקריים</h2>
    <div class="kpi-grid">
      <div class="kpi"><span class="kpi-l">הוצאות</span><span class="kpi-v neg">${esc(formatIls(payload.kpi.spent))}</span></div>
      <div class="kpi"><span class="kpi-l">תקציב מתוכנן</span><span class="kpi-v">${esc(formatIls(payload.kpi.planned))}</span></div>
      <div class="kpi"><span class="kpi-l">יתרה</span><span class="kpi-v ${payload.kpi.remaining < 0 ? 'neg' : 'pos'}">${esc(formatIls(payload.kpi.remaining))}</span></div>
      <div class="kpi"><span class="kpi-l">ניצול</span><span class="kpi-v">${esc(util)}${payload.kpi.over_pace ? ' · מעל קצב' : ''}</span></div>
    </div>
    <p class="muted" style="margin-top:8px">
      השוואה ל־${esc(payload.kpi.previous_period_key)}: ${esc(formatIls(payload.kpi.previous_spent))}
      · שינוי: ${payload.kpi.spend_delta > 0 ? '+' : ''}${esc(formatIls(payload.kpi.spend_delta))}${esc(deltaPct)}
    </p>
  </section>

  ${growBlock}

  <section>
    <h2>רו״ח תמציתי</h2>
    <table>
      <tbody>
        <tr><td>הוצאות תחזוקה</td><td class="num neg">(${esc(formatIls(payload.pnl.expenses_total))})</td></tr>
        ${incomeRow}
        ${netRow}
      </tbody>
    </table>
  </section>

  <section>
    <h2>לפי קטגוריה</h2>
    <table>
      <thead><tr><th>קטגוריה</th><th class="num">כמות</th><th class="num">סכום</th><th class="num">%</th></tr></thead>
      <tbody>${bucketRows(payload.byCategory)}</tbody>
    </table>
  </section>

  <section>
    <h2>לפי סטטוס תשלום</h2>
    <table>
      <thead><tr><th>סטטוס</th><th class="num">כמות</th><th class="num">סכום</th><th class="num">%</th></tr></thead>
      <tbody>${bucketRows(payload.byPaymentStatus)}</tbody>
    </table>
  </section>

  <section>
    <h2>לפי ספק</h2>
    <table>
      <thead><tr><th>ספק</th><th class="num">כמות</th><th class="num">סכום</th><th class="num">%</th></tr></thead>
      <tbody>${bucketRows(payload.byVendor)}</tbody>
    </table>
  </section>

  <section>
    <h2>פירוט הוצאות</h2>
    ${truncatedNote}
    <table>
      <thead>
        <tr>
          <th>תאריך</th>
          <th class="num">סכום</th>
          <th>ספק</th>
          <th>קטגוריה</th>
          <th>סטטוס</th>
          <th>תיאור</th>
        </tr>
      </thead>
      <tbody>${lineRows(payload.lines)}</tbody>
    </table>
  </section>

  <footer class="footer">${esc(REPORT_PRINT_FOOTER)}</footer>
</body>
</html>`
}

/**
 * Open a print window with branded report HTML. Returns false if popup blocked.
 *
 * Do NOT pass `noopener` to window.open: browsers return null for the WindowProxy
 * when noopener is set, which made «ייצוא מעוצב» always look popup-blocked.
 * We still clear `opener` after open for the same security intent.
 */
export function openBrandedReportPrint(payload: ReportPrintPayload): boolean {
  const html = buildReportPrintHtml({
    ...payload,
    logoUrl: resolveReportPrintLogoUrl(payload.logoUrl, window.location.origin),
  })
  // Features only — no noopener/noreferrer (need a writable Window reference).
  const w = window.open('', '_blank', 'width=960,height=720')
  if (!w) return false
  try {
    w.opener = null
  } catch {
    /* ignore */
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
  const trigger = () => {
    try {
      w.focus()
      w.print()
    } catch {
      /* ignore */
    }
  }
  // Allow images (logo) to settle before print dialog.
  if (w.document.readyState === 'complete') {
    setTimeout(trigger, 250)
  } else {
    w.addEventListener('load', () => setTimeout(trigger, 250))
  }
  return true
}
