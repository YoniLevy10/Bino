'use client'

/**
 * Building Hub — Reports tab.
 * High-level building accounting: budget vs actual, category/vendor rollups, P&L.
 * North-star: עלות תחזוקה לבניין / prove savings — not vanity charts.
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import { toast, errorMessageFromResponseJson } from '@/lib/error-handler'
import {
  defaultPeriodKey,
  type FinancePeriodGranularity,
} from '@/lib/building-finance/period'
import {
  openBrandedReportPrint,
  REPORT_PRINT_FOOTER,
} from '@/lib/building-finance/report-print'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { useClientBranding } from '@/app/components/ClientBrandingContext'
import { Button, LoadingSpinner, theme } from '@/app/components/ui'

type ReportBucket = {
  key: string
  label: string
  amount: number
  count: number
  pct: number
}

type ReportLine = {
  expense_date: string
  amount: number
  vendor_name: string | null
  description: string | null
  payment_status: string
  category_label: string
}

type ReportResponse = {
  project: { id: string; name: string }
  period: {
    period_key: string
    granularity: FinancePeriodGranularity
    start_date: string
    end_date: string
    label_he: string
    previous_period_key: string
  }
  kpi: {
    period_key: string
    planned: number
    spent: number
    recorded_spend?: number
    paid_spend?: number
    remaining: number
    utilization_pct: number | null
    over_pace: boolean
    utilization_basis?: 'recorded' | 'paid'
    utilization_basis_label_he?: string
    planned_source: 'exact' | 'annual_prorata' | 'none'
    previous_spent: number
    spend_delta: number
    spend_delta_pct: number | null
  }
  breakdown: {
    by_category: ReportBucket[]
    by_payment_status: ReportBucket[]
    by_vendor: ReportBucket[]
  }
  pnl: {
    expenses_total: number
    recorded_spend?: number
    paid_spend?: number
    income_grow_collected: number | null
    net: number | null
    lines: ReportLine[]
    truncated: boolean
    lines_truncated?: boolean
    totals_incomplete?: boolean
    row_count: number
    expense_count?: number
  }
  grow: {
    available: boolean
    collected: number
    outstanding: number
    billed: number
    net_vs_expenses: number | null
    labels?: {
      collected: string
      outstanding: string
      billed: string
    } | null
    collected_date_basis?: string | null
  } | null
  error?: string
  code?: string
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

function shiftPeriodKey(periodKey: string, granularity: FinancePeriodGranularity, dir: -1 | 1): string {
  const yearMatch = /^(\d{4})$/.exec(periodKey)
  if (yearMatch && granularity === 'year') {
    return String(Number(yearMatch[1]) + dir)
  }
  const qMatch = /^(\d{4})-Q([1-4])$/.exec(periodKey)
  if (qMatch) {
    let y = Number(qMatch[1])
    let q = Number(qMatch[2]) + dir
    if (q < 1) {
      q = 4
      y -= 1
    } else if (q > 4) {
      q = 1
      y += 1
    }
    return `${y}-Q${q}`
  }
  const mMatch = /^(\d{4})-(\d{2})$/.exec(periodKey)
  if (mMatch) {
    let y = Number(mMatch[1])
    let m = Number(mMatch[2]) + dir
    if (m < 1) {
      m = 12
      y -= 1
    } else if (m > 12) {
      m = 1
      y += 1
    }
    return `${y}-${String(m).padStart(2, '0')}`
  }
  return periodKey
}

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

export function BuildingReportsPanel({
  projectId,
  projectName,
  isMobile: isMobileProp,
}: Props) {
  const branding = useClientBranding()
  const [viewportMobile, setViewportMobile] = useState(false)
  const [granularity, setGranularity] = useState<FinancePeriodGranularity>('year')
  const [periodKey, setPeriodKey] = useState(() => defaultPeriodKey('year'))
  const [report, setReport] = useState<ReportResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [locked, setLocked] = useState(false)
  const [lockMessage, setLockMessage] = useState<string | null>(null)

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
      const qs = new URLSearchParams({
        project_id: projectId,
        period_key: periodKey,
        granularity,
      })
      const res = await fetchWithTimeout(`/api/building-finance/reports?${qs.toString()}`)
      const json = (await res.json()) as ReportResponse
      if (json.code === 'FINANCE_PLATFORM_DISABLED') {
        setLocked(true)
        setLockMessage(json.error || 'הנהלת חשבונות בניין כבויה כרגע בפלטפורמה')
        setReport(null)
        return
      }
      if (!res.ok) {
        throw new Error(errorMessageFromResponseJson(json, `שגיאה ${res.status}`))
      }
      setReport(json)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'טעינת דוח נכשלה')
      setReport(null)
    } finally {
      setLoading(false)
    }
  }, [projectId, periodKey, granularity])

  useEffect(() => {
    void load()
  }, [load])

  function onGranularityChange(next: FinancePeriodGranularity) {
    setGranularity(next)
    setPeriodKey(defaultPeriodKey(next))
  }

  const plannedHint = useMemo(() => {
    if (!report) return null
    if (report.kpi.planned_source === 'annual_prorata') {
      return 'תקציב מחושב יחסית מתקציב שנתי'
    }
    if (report.kpi.planned_source === 'none') {
      return 'לא הוגדר תקציב לתקופה'
    }
    return null
  }, [report])

  function downloadCsv() {
    if (!report) return
    const header = ['תאריך', 'סכום', 'ספק', 'קטגוריה', 'סטטוס', 'תיאור']
    const rows = report.pnl.lines.map((line) =>
      [
        line.expense_date,
        String(line.amount),
        line.vendor_name || '',
        line.category_label,
        PAYMENT_LABELS[line.payment_status] || line.payment_status,
        line.description || '',
      ]
        .map(csvEscape)
        .join(',')
    )
    const summary = [
      `# דוח בניין — ${projectName}`,
      `# תקופה: ${report.period.label_he} (${report.period.start_date}–${report.period.end_date})`,
      `# הוצאות רשומות: ${report.kpi.recorded_spend ?? report.kpi.spent}`,
      `# שולם בפועל: ${report.kpi.paid_spend ?? 0}`,
      `# תקציב: ${report.kpi.planned}`,
      `# יתרה: ${report.kpi.remaining}`,
      `# בסיס ניצול: רשום`,
      '',
      header.join(','),
      ...rows,
    ].join('\n')
    const blob = new Blob(['\ufeff' + summary], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bino-report-${projectName}-${report.period.period_key}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function printReport() {
    if (!report) return
    const ok = openBrandedReportPrint({
      projectName,
      clientName: branding.displayName || 'Bino',
      logoUrl: branding.logoUrl,
      periodLabel: report.period.label_he,
      periodRange: `${report.period.start_date}–${report.period.end_date}`,
      kpi: {
        spent: report.kpi.spent,
        planned: report.kpi.planned,
        remaining: report.kpi.remaining,
        utilization_pct: report.kpi.utilization_pct,
        over_pace: report.kpi.over_pace,
        previous_spent: report.kpi.previous_spent,
        previous_period_key: report.period.previous_period_key,
        spend_delta: report.kpi.spend_delta,
        spend_delta_pct: report.kpi.spend_delta_pct,
      },
      grow: report.grow?.available
        ? {
            collected: report.grow.collected,
            outstanding: report.grow.outstanding,
            net_vs_expenses: report.grow.net_vs_expenses,
          }
        : null,
      pnl: {
        expenses_total: report.pnl.expenses_total,
        income_grow_collected: report.pnl.income_grow_collected,
        net: report.pnl.net,
      },
      byCategory: report.breakdown.by_category,
      byPaymentStatus: report.breakdown.by_payment_status,
      byVendor: report.breakdown.by_vendor,
      lines: report.pnl.lines,
      truncated: report.pnl.truncated,
      rowCount: report.pnl.row_count,
    })
    if (!ok) {
      toast.error('יש לאפשר חלונות קופצים כדי לייצא דוח מעוצב')
    }
  }

  if (loading && !report) {
    return (
      <div style={styles.center}>
        <LoadingSpinner />
      </div>
    )
  }

  if (locked) {
    return (
      <div style={styles.lockBox}>
        <p style={styles.lockTitle}>דוחות הנהלת חשבונות</p>
        <p style={styles.lockBody}>{lockMessage}</p>
        <p style={styles.lockHint}>
          פיצ׳ר ליבה — נשלט ב־kill-switch של הפלטפורמה (
          <code>BUILDING_FINANCE_ENABLED</code>
          ). אין תוסף בתשלום להפעלה.
        </p>
      </div>
    )
  }

  return (
    <div style={styles.root} data-building-reports="true">
      <div style={styles.letterhead} aria-hidden={false}>
        <div style={styles.letterheadMain}>
          {/* Prefer clients.logo_url from branding context; fallback to platform mark. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={branding.logoUrl || '/bino-mark.png'}
            alt=""
            style={styles.logo}
          />
          <div style={styles.letterheadText}>
            <p style={styles.clientName}>{branding.displayName || 'Bino'}</p>
            <p style={styles.reportEyebrow}>דוח הנהלת חשבונות — {projectName}</p>
          </div>
        </div>
      </div>

      <p style={styles.intro}>
        דוח ל־<strong>{projectName}</strong> — תקציב מול ביצוע ועלות תחזוקה.
      </p>

      <div
        style={{
          ...styles.controls,
          ...(isMobile ? styles.controlsMobile : null),
        }}
        className="building-reports-no-print"
      >
        <div style={styles.granularityRow} role="group" aria-label="רזולוציית תקופה">
          {(
            [
              ['year', 'שנה'],
              ['quarter', 'רבעון'],
              ['month', 'חודש'],
            ] as const
          ).map(([id, label]) => {
            const active = granularity === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => onGranularityChange(id)}
                style={{
                  ...styles.granBtn,
                  ...(isMobile ? styles.granBtnMobile : null),
                  ...(active ? styles.granBtnActive : null),
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
        <div
          style={{
            ...styles.periodNav,
            ...(isMobile ? styles.periodNavMobile : null),
          }}
        >
          <Button
            type="button"
            variant="secondary"
            size={isMobile ? 'md' : 'sm'}
            onClick={() => setPeriodKey((k) => shiftPeriodKey(k, granularity, -1))}
            style={isMobile ? styles.periodNavBtn : undefined}
          >
            ← קודם
          </Button>
          <span
            style={{
              ...styles.periodLabel,
              ...(isMobile ? styles.periodLabelMobile : null),
            }}
          >
            {report?.period.label_he ?? periodKey}
          </span>
          <Button
            type="button"
            variant="secondary"
            size={isMobile ? 'md' : 'sm'}
            onClick={() => setPeriodKey((k) => shiftPeriodKey(k, granularity, 1))}
            style={isMobile ? styles.periodNavBtn : undefined}
          >
            הבא →
          </Button>
        </div>
        <div
          style={{
            ...styles.actions,
            ...(isMobile ? styles.actionsMobile : null),
          }}
        >
          <Button
            type="button"
            variant="secondary"
            size={isMobile ? 'md' : 'sm'}
            onClick={() => void load()}
            style={isMobile ? styles.fullBtn : undefined}
          >
            רענון
          </Button>
          <Button
            type="button"
            variant="primary"
            size={isMobile ? 'md' : 'sm'}
            onClick={printReport}
            disabled={!report}
            style={isMobile ? styles.fullBtn : undefined}
          >
            ייצוא מעוצב
          </Button>
          <Button
            type="button"
            variant="secondary"
            size={isMobile ? 'md' : 'sm'}
            onClick={downloadCsv}
            disabled={!report}
            style={isMobile ? styles.fullBtn : undefined}
          >
            ייצוא CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <div style={styles.center}>
          <LoadingSpinner size="sm" />
        </div>
      ) : null}

      {report ? (
        <>
          <div style={styles.kpiRow}>
            <div style={styles.kpi}>
              <span style={styles.kpiLabel}>הוצאות רשומות</span>
              <span style={{ ...styles.kpiValue, color: theme.colors.kpiNegative }}>
                {formatIls(report.kpi.recorded_spend ?? report.kpi.spent)}
              </span>
            </div>
            <div style={styles.kpi}>
              <span style={styles.kpiLabel}>שולם בפועל</span>
              <span style={{ ...styles.kpiValue, color: theme.colors.kpiNegative }}>
                {formatIls(report.kpi.paid_spend ?? 0)}
              </span>
            </div>
            <div style={styles.kpi}>
              <span style={styles.kpiLabel}>תקציב מתוכנן</span>
              <span style={styles.kpiValue}>{formatIls(report.kpi.planned)}</span>
              {plannedHint ? <span style={styles.kpiHint}>{plannedHint}</span> : null}
            </div>
            <div style={styles.kpi}>
              <span style={styles.kpiLabel}>יתרה</span>
              <span
                style={{
                  ...styles.kpiValue,
                  color:
                    report.kpi.remaining < 0
                      ? theme.colors.kpiNegative
                      : theme.colors.kpiPositive,
                }}
              >
                {formatIls(report.kpi.remaining)}
              </span>
            </div>
            <div style={styles.kpi}>
              <span style={styles.kpiLabel}>ניצול (רשום)</span>
              <span style={styles.kpiValue}>
                {report.kpi.utilization_pct == null
                  ? '—'
                  : `${report.kpi.utilization_pct}%`}
                {report.kpi.over_pace ? (
                  <span style={styles.paceWarn}> · מעל קצב</span>
                ) : null}
              </span>
              <span style={styles.kpiHint}>
                {report.kpi.utilization_basis_label_he ||
                  'ניצול תקציב לפי הוצאות רשומות (לא רק שולם)'}
              </span>
            </div>
          </div>

          <div style={styles.compareCard}>
            <p style={styles.sectionTitle}>השוואה לתקופה קודמת</p>
            <p style={styles.compareBody}>
              {report.period.previous_period_key}: {formatIls(report.kpi.previous_spent)}
              {' · '}
              שינוי:{' '}
              <span
                style={{
                  color:
                    report.kpi.spend_delta > 0
                      ? theme.colors.kpiNegative
                      : theme.colors.kpiPositive,
                  fontWeight: theme.typography.fontWeight.semibold,
                }}
              >
                {report.kpi.spend_delta > 0 ? '+' : ''}
                {formatIls(report.kpi.spend_delta)}
                {report.kpi.spend_delta_pct != null
                  ? ` (${report.kpi.spend_delta_pct > 0 ? '+' : ''}${report.kpi.spend_delta_pct}%)`
                  : ''}
              </span>
            </p>
          </div>

          {report.grow?.available ? (
            <div style={styles.growCard}>
              <p style={styles.sectionTitle}>גבייה (Grow) — קריאה בלבד</p>
              <div
                style={{
                  ...styles.growGrid,
                  ...(isMobile ? styles.growGridMobile : null),
                }}
              >
                  <div>
                    <span style={styles.kpiLabel}>
                      {report.grow.labels?.collected || 'נגבה לפי תאריך תשלום'}
                    </span>
                    <div style={{ ...styles.kpiValue, color: theme.colors.kpiPositive }}>
                      {formatIls(report.grow.collected)}
                    </div>
                  </div>
                  <div>
                    <span style={styles.kpiLabel}>
                      {report.grow.labels?.outstanding || 'פתוח לפי תאריך יצירה'}
                    </span>
                    <div style={styles.kpiValue}>{formatIls(report.grow.outstanding)}</div>
                  </div>
                  <div>
                    <span style={styles.kpiLabel}>
                      {report.grow.labels?.billed || 'חויב לפי תאריך יצירה'}
                    </span>
                    <div style={styles.kpiValue}>{formatIls(report.grow.billed)}</div>
                  </div>
                  <div>
                    <span style={styles.kpiLabel}>נטו מול הוצאות רשומות</span>
                  <div
                    style={{
                      ...styles.kpiValue,
                      color:
                        (report.grow.net_vs_expenses ?? 0) >= 0
                          ? theme.colors.kpiPositive
                          : theme.colors.kpiNegative,
                    }}
                  >
                    {formatIls(report.grow.net_vs_expenses ?? 0)}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div style={styles.pnlCard}>
            <p style={styles.sectionTitle}>רו״ח תמציתי</p>
            <div style={styles.pnlRow}>
              <span>הוצאות רשומות</span>
              <span style={{ color: theme.colors.kpiNegative }}>
                ({formatIls(report.pnl.recorded_spend ?? report.pnl.expenses_total)})
              </span>
            </div>
            <div style={styles.pnlRow}>
              <span>הוצאות ששולמו</span>
              <span style={{ color: theme.colors.kpiNegative }}>
                ({formatIls(report.pnl.paid_spend ?? 0)})
              </span>
            </div>
            {report.pnl.income_grow_collected != null ? (
              <div style={styles.pnlRow}>
                <span>הכנסות גבייה (Grow)</span>
                <span style={{ color: theme.colors.kpiPositive }}>
                  {formatIls(report.pnl.income_grow_collected)}
                </span>
              </div>
            ) : (
              <p style={styles.muted}>
                הכנסות גבייה יופיעו כאן אם תוסף Collections פעיל — ללא שינוי ב־Grow.
              </p>
            )}
            {report.pnl.net != null ? (
              <div style={{ ...styles.pnlRow, ...styles.pnlNet }}>
                <span>נטו לתקופה</span>
                <span
                  style={{
                    color:
                      report.pnl.net >= 0
                        ? theme.colors.kpiPositive
                        : theme.colors.kpiNegative,
                  }}
                >
                  {formatIls(report.pnl.net)}
                </span>
              </div>
            ) : null}
          </div>

          <BreakdownSection title="לפי קטגוריה" buckets={report.breakdown.by_category} />
          <BreakdownSection title="לפי סטטוס תשלום" buckets={report.breakdown.by_payment_status} />
          <BreakdownSection title="לפי ספק" buckets={report.breakdown.by_vendor} />

          <div>
            <div style={styles.listHeader}>
              <p style={styles.sectionTitle}>פירוט הוצאות</p>
              {report.pnl.totals_incomplete ? (
                <span style={styles.muted}>סיכום התקופה חלקי — בדקו שוב מאוחר יותר</span>
              ) : report.pnl.lines_truncated || report.pnl.truncated ? (
                <span style={styles.muted}>
                  מוצגות שורות מוגבלות ({report.pnl.row_count}
                  {report.pnl.expense_count != null
                    ? ` מתוך ${report.pnl.expense_count}`
                    : ''}
                  ) — הסה״כ מלא
                </span>
              ) : null}
            </div>
            {report.pnl.lines.length === 0 ? (
              <p style={styles.empty}>אין הוצאות בתקופה זו.</p>
            ) : (
              <ul style={styles.list}>
                {report.pnl.lines.map((line, idx) => (
                  <li key={`${line.expense_date}-${idx}`} style={styles.listItem}>
                    <div style={styles.listMain}>
                      <span style={styles.listAmount}>{formatIls(line.amount)}</span>
                      <span style={styles.listMeta}>
                        {line.expense_date}
                        {line.vendor_name ? ` · ${line.vendor_name}` : ''}
                        {` · ${line.category_label}`}
                      </span>
                      {line.description ? (
                        <span style={styles.listDesc}>{line.description}</span>
                      ) : null}
                    </div>
                    <span
                      style={{
                        ...styles.statusPill,
                        background:
                          line.payment_status === 'paid'
                            ? theme.colors.paymentPaidMuted
                            : line.payment_status === 'partial'
                              ? theme.colors.paymentPartialMuted
                              : theme.colors.paymentPendingMuted,
                        color:
                          line.payment_status === 'paid'
                            ? theme.colors.paymentPaid
                            : line.payment_status === 'partial'
                              ? theme.colors.paymentPartial
                              : theme.colors.paymentPending,
                      }}
                    >
                      {PAYMENT_LABELS[line.payment_status] || line.payment_status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : !loading ? (
        <p style={styles.empty}>לא ניתן לטעון דוח.</p>
      ) : null}

      <p style={styles.brandFooter} data-report-footer={REPORT_PRINT_FOOTER}>
        {REPORT_PRINT_FOOTER}
      </p>
    </div>
  )
}

function BreakdownSection({ title, buckets }: { title: string; buckets: ReportBucket[] }) {
  return (
    <div style={styles.breakdown}>
      <p style={styles.sectionTitle}>{title}</p>
      {buckets.length === 0 ? (
        <p style={styles.empty}>אין נתונים</p>
      ) : (
        <ul style={styles.breakdownList}>
          {buckets.map((b) => (
            <li key={b.key} style={styles.breakdownItem}>
              <div style={styles.breakdownTop}>
                <span style={styles.breakdownLabel}>
                  {b.label}
                  <span style={styles.muted}> · {b.count}</span>
                </span>
                <span style={styles.breakdownAmount}>
                  {formatIls(b.amount)}
                  <span style={styles.muted}> · {b.pct}%</span>
                </span>
              </div>
              <div style={styles.barTrack}>
                <div
                  style={{
                    ...styles.barFill,
                    width: `${Math.min(100, Math.max(0, b.pct))}%`,
                  }}
                />
              </div>
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
    position: 'relative' as const,
    zIndex: 0,
  },
  letterhead: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottom: `1px solid ${theme.colors.borderSubtle}`,
    maxWidth: '100%',
    minWidth: 0,
  },
  letterheadMain: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    minWidth: 0,
  },
  logo: {
    width: 48,
    height: 48,
    objectFit: 'contain',
    borderRadius: theme.radius.md,
    flexShrink: 0,
    background: theme.colors.surfaceInset,
  },
  letterheadText: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  clientName: {
    margin: 0,
    fontSize: theme.typography.fontSize.base,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  reportEyebrow: {
    margin: 0,
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textMuted,
    fontWeight: theme.typography.fontWeight.medium,
  },
  brandFooter: {
    margin: `${theme.spacing.md} 0 0`,
    paddingTop: theme.spacing.sm,
    borderTop: `1px solid ${theme.colors.borderSubtle}`,
    textAlign: 'center',
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.textMuted,
    letterSpacing: '0.02em',
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
  controls: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
    maxWidth: '100%',
    minWidth: 0,
  },
  controlsMobile: {
    // Do not sticky/port a second chrome layer inside BuildingHubModal —
    // sticky + z-index stacked over the hub and blocked tab/close taps.
    position: 'relative' as const,
    zIndex: 0,
    paddingBottom: theme.spacing.sm,
    background: theme.colors.background,
  },
  granularityRow: {
    display: 'flex',
    gap: 4,
    padding: 4,
    borderRadius: theme.radius.lg,
    background: theme.colors.surfaceInset,
  },
  granBtn: {
    flex: 1,
    minHeight: 34,
    borderRadius: theme.radius.full,
    border: '1px solid transparent',
    background: 'transparent',
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeight.semibold,
    fontSize: theme.typography.fontSize.sm,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  granBtnMobile: {
    minHeight: 44,
  },
  granBtnActive: {
    background: theme.colors.surface,
    borderColor: theme.colors.borderSelected,
    color: theme.colors.primary,
    boxShadow: theme.shadows.xs,
  },
  periodNav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  periodNavMobile: {
    flexWrap: 'wrap' as const,
  },
  periodNavBtn: {
    minHeight: 44,
    flex: '1 1 120px',
  },
  periodLabel: {
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
    fontSize: theme.typography.fontSize.sm,
    textAlign: 'center' as const,
    minWidth: 0,
  },
  periodLabelMobile: {
    flex: '1 1 100%',
    order: -1,
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  actionsMobile: {
    flexDirection: 'column',
  },
  fullBtn: {
    width: '100%',
    minHeight: 48,
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
  kpiHint: {
    fontSize: theme.typography.fontSize.xs,
    color: theme.colors.textMuted,
  },
  paceWarn: {
    color: theme.colors.kpiNegative,
    fontSize: theme.typography.fontSize.xs,
    fontWeight: theme.typography.fontWeight.semibold,
  },
  compareCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.borderSubtle}`,
    background: theme.colors.surface,
  },
  compareBody: {
    margin: '6px 0 0',
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textSecondary,
  },
  growCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.blueSoft,
  },
  growGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  growGridMobile: {
    gridTemplateColumns: '1fr',
  },
  pnlCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.surface,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  pnlRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textPrimary,
  },
  pnlNet: {
    marginTop: 4,
    paddingTop: 8,
    borderTop: `1px solid ${theme.colors.borderSubtle}`,
    fontWeight: theme.typography.fontWeight.bold,
  },
  sectionTitle: {
    margin: 0,
    fontSize: theme.typography.fontSize.sm,
    fontWeight: theme.typography.fontWeight.bold,
    color: theme.colors.textPrimary,
  },
  breakdown: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
  },
  breakdownList: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm,
  },
  breakdownItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  breakdownTop: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    fontSize: theme.typography.fontSize.sm,
  },
  breakdownLabel: {
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.fontWeight.medium,
  },
  breakdownAmount: {
    color: theme.colors.textPrimary,
    fontWeight: theme.typography.fontWeight.semibold,
    whiteSpace: 'nowrap' as const,
  },
  barTrack: {
    height: 6,
    borderRadius: theme.radius.full,
    background: theme.colors.surfaceInset,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: theme.radius.full,
    background: theme.colors.primary,
  },
  listHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  empty: {
    margin: 0,
    fontSize: theme.typography.fontSize.sm,
    color: theme.colors.textMuted,
  },
  muted: {
    fontSize: theme.typography.fontSize.xs,
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
  listMain: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    minWidth: 0,
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
