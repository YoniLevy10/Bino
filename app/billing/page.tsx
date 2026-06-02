'use client'

/**
 * דף תוכנית וחיוב – סיכום צריכה ומגבלות המנוי הנוכחי.
 *
 * מציג: תוכנית פעילה (starter/pro/business/enterprise), KPI צריכה (תקלות החודש,
 * דיירים, עובדים), גרף שימוש שבועי, ומגבלות התוכנית.
 *
 * מנוי:
 *  - starter ₪299/חודש | pro ₪499 | business ₪699 | enterprise ₪899+
 *  - לחיצה "שדרג תוכנית" → מנהל Bamakor מעדכן ידנית בDB
 *
 * קשור ל: lib/plan-limits.ts
 */
import { useEffect, useState, type CSSProperties } from 'react'
import {
  AppShell,
  MobileHeader,
  MobileMenu,
  PageHeader,
  Card,
  KpiCard,
  LoadingSpinner,
  theme,
} from '../components/ui'
import { getIsMobileViewport } from '@/lib/mobile-viewport'
import { PageKpiSkeletonN, PageListSkeleton } from '../components/page-skeleton'
import { asyncHandler } from '@/lib/error-handler'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'

type PlanLimits = {
  buildings: number
  workers: number
  tickets_per_month: number
}

type PlanRow = {
  id: string
  label: string
  price: string
  limits: PlanLimits
  limitsLine: string
  isCurrent: boolean
}

type Summary = {
  ticketsThisMonth: number
  residentsTotal: number
  workersActive: number
  buildingsActive?: number
  ticketsByWeek: { week_start: string; count: number }[]
  plan?: {
    tier: string
    label: string
    price: string
    limitsLine: string
    maxBuildings: number | null
    maxWorkers: number | null
    maxTicketsPerMonth: number | null
  }
  plans?: PlanRow[]
}

function formatCap(value: number | null | undefined, used: number): string {
  if (value == null) return `${used.toLocaleString('he-IL')} / ללא הגבלה`
  return `${used.toLocaleString('he-IL')} / ${value.toLocaleString('he-IL')}`
}

function formatLimitCell(value: number): string {
  return value === Infinity ? 'ללא הגבלה' : value.toLocaleString('he-IL')
}

export default function BillingPage() {
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<Summary | null>(null)

  useEffect(() => {
    const check = () => setIsMobile(getIsMobileViewport())
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    void (async () => {
      setLoading(true)
      await asyncHandler(
        async () => {
          const res = await fetchWithTimeout('/api/billing/summary')
          const json = (await res.json()) as Summary & { error?: string }
          if (!res.ok) throw new Error(json.error || 'טעינה נכשלה')
          setData({
            ticketsThisMonth: json.ticketsThisMonth,
            residentsTotal: json.residentsTotal,
            workersActive: json.workersActive,
            buildingsActive: json.buildingsActive,
            ticketsByWeek: json.ticketsByWeek || [],
            plan: json.plan,
            plans: json.plans,
          })
          return true
        },
        { context: 'טעינת חיוב', showErrorToast: true }
      )
      setLoading(false)
    })()
  }, [])

  const maxWeek = Math.max(1, ...(data?.ticketsByWeek.map((w) => w.count) || [1]))

  return (
    <AppShell isMobile={isMobile}>
      {isMobile && (
        <MobileHeader title="חיוב ושימוש" subtitle="סיכום למנהל" onMenuClick={() => setMenuOpen(true)} />
      )}
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div
        style={{
          ...styles.content,
          ...(isMobile ? { padding: '16px 16px 8px', maxWidth: '100%', boxSizing: 'border-box' } : {}),
        }}
      >
        {!isMobile && <PageHeader title="חיוב ושימוש" subtitle="תוכנית חודשית ומדדי צריכה" />}

        {loading ? (
          <div style={styles.loading}>
            <PageKpiSkeletonN columns={3} />
            <PageListSkeleton rows={6} />
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
              <LoadingSpinner size="md" />
            </div>
          </div>
        ) : !data ? null : (
          <>
            {data.plan && (
              <Card noPadding style={{ marginBottom: 20 }}>
                <div style={styles.cardPad}>
                  <h2 style={styles.h2}>תוכנית חודשית פעילה</h2>
                  <p style={styles.planLead}>
                    <strong>{data.plan.label}</strong> — {data.plan.price}
                  </p>
                  <p style={styles.mutedSmall}>{data.plan.limitsLine}</p>
                  <div
                    style={{
                      ...styles.usageGrid,
                      gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
                    }}
                  >
                    <div style={styles.usageCell}>
                      <span style={styles.usageLabel}>בניינים פעילים</span>
                      <span style={styles.usageVal}>
                        {formatCap(data.plan.maxBuildings, data.buildingsActive ?? 0)}
                      </span>
                    </div>
                    <div style={styles.usageCell}>
                      <span style={styles.usageLabel}>עובדים פעילים</span>
                      <span style={styles.usageVal}>
                        {formatCap(data.plan.maxWorkers, data.workersActive)}
                      </span>
                    </div>
                    <div style={styles.usageCell}>
                      <span style={styles.usageLabel}>תקלות החודש</span>
                      <span style={styles.usageVal}>
                        {formatCap(data.plan.maxTicketsPerMonth, data.ticketsThisMonth)}
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            )}

            <div
              style={{
                ...styles.kpiGrid,
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
              }}
            >
              <KpiCard label="טיקטים החודש" value={data.ticketsThisMonth} accent="primary" />
              <KpiCard label="דיירים (סה״כ ברשומה)" value={data.residentsTotal} accent="success" />
              <KpiCard label="עובדים פעילים" value={data.workersActive} />
            </div>

            {data.plans && data.plans.length > 0 && (
              <Card noPadding style={{ marginTop: 20 }}>
                <div style={styles.cardPad}>
                  <h2 style={styles.h2}>תוכניות חיוב חודשיות</h2>
                  <p style={styles.mutedSmall}>
                    תמחור לפי מסלול. שדרוג — פנו להנהלת Bamakor / Levy Tech.
                  </p>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={styles.plansTable}>
                      <thead>
                        <tr>
                          {['מסלול', 'מחיר/חודש', 'בניינים', 'עובדים', 'תקלות/חודש', ''].map((h) => (
                            <th key={h || 'status'} style={styles.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.plans.map((p) => (
                          <tr
                            key={p.id}
                            style={{
                              background: p.isCurrent ? theme.colors.primaryMuted : undefined,
                            }}
                          >
                            <td style={styles.td}><strong>{p.label}</strong></td>
                            <td style={styles.td}>{p.price}</td>
                            <td style={styles.td}>{formatLimitCell(p.limits.buildings)}</td>
                            <td style={styles.td}>{formatLimitCell(p.limits.workers)}</td>
                            <td style={styles.td}>{formatLimitCell(p.limits.tickets_per_month)}</td>
                            <td style={styles.td}>
                              {p.isCurrent ? (
                                <span style={styles.currentBadge}>פעיל אצלכם</span>
                              ) : (
                                <span style={styles.mutedSmall}>—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </Card>
            )}

            <Card noPadding style={{ marginTop: '20px' }}>
              <div style={styles.cardPad}>
                <h2 style={styles.h2}>טיקטים לפי שבוע (8 שבועות אחרונים)</h2>
                <div style={styles.chartRow}>
                  {data.ticketsByWeek.length === 0 ? (
                    <p style={styles.muted}>אין נתונים בתקופה</p>
                  ) : (
                    data.ticketsByWeek.map((w) => (
                      <div key={w.week_start} style={styles.barCol}>
                        <div style={styles.barTrack}>
                          <div
                            style={{
                              ...styles.barFill,
                              height: `${Math.max(6, (w.count / maxWeek) * 100)}%`,
                            }}
                            title={`${w.count}`}
                          />
                        </div>
                        <span style={styles.barLabel}>{w.week_start.slice(5)}</span>
                        <span style={styles.barCount}>{w.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Card>

            <Card noPadding style={{ marginTop: '16px' }}>
              <div style={styles.cardPad}>
                <p style={styles.note}>
                  חשבוניות מסודרות יופקו בהמשך. התוספים יומן ושעון עובדים מחויבים בנפרד מהמסלול החודשי.
                </p>
              </div>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  )
}

const styles: Record<string, CSSProperties> = {
  content: {
    padding: '32px 40px',
    maxWidth: '1000px',
    margin: '0 auto',
  },
  loading: { padding: '64px', display: 'flex', justifyContent: 'center' },
  kpiGrid: { display: 'grid', gap: '16px' },
  cardPad: { padding: '20px 24px' },
  h2: {
    fontSize: '16px',
    fontWeight: 600,
    margin: '0 0 16px',
    color: theme.colors.textPrimary,
  },
  chartRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '8px',
    minHeight: '140px',
    flexWrap: 'wrap',
  },
  barCol: {
    flex: '1 1 40px',
    minWidth: '36px',
    maxWidth: '56px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
  },
  barTrack: {
    width: '100%',
    height: '100px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    background: theme.colors.muted,
    borderRadius: theme.radius.sm,
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    background: theme.colors.primary,
    borderRadius: `${theme.radius.sm} ${theme.radius.sm} 0 0`,
    minHeight: '4px',
    transition: 'height 0.2s ease',
  },
  barLabel: { fontSize: '10px', color: theme.colors.textMuted },
  barCount: { fontSize: '12px', fontWeight: 600, color: theme.colors.textPrimary },
  muted: { color: theme.colors.textMuted, fontSize: '14px' },
  note: {
    margin: 0,
    fontSize: '14px',
    lineHeight: 1.55,
    color: theme.colors.textSecondary,
  },
  planLead: {
    margin: '0 0 6px',
    fontSize: '18px',
    color: theme.colors.textPrimary,
  },
  mutedSmall: {
    margin: '0 0 12px',
    fontSize: '13px',
    color: theme.colors.textMuted,
    lineHeight: 1.5,
  },
  usageGrid: { display: 'grid', gap: 12, marginTop: 12 },
  usageCell: {
    padding: '12px 14px',
    borderRadius: theme.radius.md,
    background: theme.colors.muted,
  },
  usageLabel: {
    display: 'block',
    fontSize: '12px',
    color: theme.colors.textMuted,
    marginBottom: 4,
  },
  usageVal: { fontSize: '15px', fontWeight: 600, color: theme.colors.textPrimary },
  plansTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px',
    marginTop: 8,
  },
  th: {
    textAlign: 'right',
    padding: '10px 12px',
    borderBottom: `2px solid ${theme.colors.border}`,
    color: theme.colors.textMuted,
    fontSize: '12px',
    fontWeight: 600,
  },
  td: {
    padding: '12px',
    borderBottom: `1px solid ${theme.colors.border}`,
    color: theme.colors.textPrimary,
  },
  currentBadge: {
    fontSize: '12px',
    fontWeight: 700,
    color: theme.colors.primary,
    background: theme.colors.primaryMuted,
    padding: '4px 10px',
    borderRadius: theme.radius.full,
    whiteSpace: 'nowrap',
  },
}
