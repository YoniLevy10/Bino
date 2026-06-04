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
import Link from 'next/link'
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
import { formatLimitHe, formatPlanPriceDisplay, formatPlanPriceIls } from '@/lib/plan-pricing'
import type { PlanPricingCatalogRow } from '@/lib/plan-pricing'
import { usePaidAddons } from '../components/PaidAddonsContext'
import type { PlanTier } from '@/lib/plan-limits'

type Summary = {
  ticketsThisMonth: number
  residentsTotal: number
  workersActive: number
  ticketsByWeek: { week_start: string; count: number }[]
}

export default function BillingPage() {
  const [isMobile, setIsMobile] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<Summary | null>(null)
  const { addons, isBootstrapped: addonsReady } = usePaidAddons()
  const [planTier, setPlanTier] = useState<PlanTier | null>(null)
  const [currentPlan, setCurrentPlan] = useState<PlanPricingCatalogRow | null>(null)
  const [planCatalog, setPlanCatalog] = useState<PlanPricingCatalogRow[]>([])
  const [setupFeeIls, setSetupFeeIls] = useState<number | null>(null)

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
          const [summaryRes, pricingRes] = await Promise.all([
            fetchWithTimeout('/api/billing/summary'),
            fetchWithTimeout('/api/billing/pricing'),
          ])
          const json = (await summaryRes.json()) as Summary & { error?: string }
          if (!summaryRes.ok) throw new Error(json.error || 'טעינה נכשלה')
          setData({
            ticketsThisMonth: json.ticketsThisMonth,
            residentsTotal: json.residentsTotal,
            workersActive: json.workersActive,
            ticketsByWeek: json.ticketsByWeek || [],
          })
          const pricingJson = (await pricingRes.json()) as {
            plan_tier?: PlanTier
            currentPlan?: PlanPricingCatalogRow
            catalog?: PlanPricingCatalogRow[]
            setup_fee_ils?: number
          }
          if (pricingRes.ok) {
            if (pricingJson.plan_tier) setPlanTier(pricingJson.plan_tier)
            setCurrentPlan(pricingJson.currentPlan ?? null)
            setPlanCatalog(pricingJson.catalog || [])
            if (typeof pricingJson.setup_fee_ils === 'number') setSetupFeeIls(pricingJson.setup_fee_ils)
          }
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
        {!isMobile && <PageHeader title="חיוב ושימוש" subtitle="מדדי שימוש ותמחור עתידי" />}

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
                <h2 style={styles.h2}>תוכנית ומנוי</h2>
                {currentPlan ? (
                  <div style={styles.planCurrent}>
                    <div>
                      <div style={styles.planCurrentTitle}>{currentPlan.name_he}</div>
                      {currentPlan.description_he ? (
                        <div style={styles.planCurrentDesc}>{currentPlan.description_he}</div>
                      ) : null}
                      <div style={styles.planCurrentPrice}>{formatPlanPriceDisplay(currentPlan)}</div>
                      <div style={styles.planLimits}>
                        בניינים: {formatLimitHe(currentPlan.buildings_max)} · עובדים:{' '}
                        {formatLimitHe(currentPlan.workers_max)} · תקלות/חודש:{' '}
                        {formatLimitHe(currentPlan.tickets_per_month_max)}
                      </div>
                    </div>
                    {planTier ? (
                      <span style={styles.planBadge}>{planTier}</span>
                    ) : null}
                  </div>
                ) : (
                  <p style={styles.muted}>לא נטען מחירון מנוי</p>
                )}
                {setupFeeIls != null ? (
                  <p style={{ ...styles.note, marginTop: 12 }}>
                    דמי הקמה (חד-פעמי): {formatPlanPriceIls(setupFeeIls)}
                  </p>
                ) : null}
                {planCatalog.length > 1 ? (
                  <>
                    <p style={{ ...styles.note, marginTop: 16 }}>מסלולים נוספים (לשדרוג — פנו לבמקור):</p>
                    <div style={styles.planCatalogList}>
                      {planCatalog
                        .filter((p) => p.plan_tier !== planTier)
                        .map((p) => (
                          <div key={p.plan_tier} style={styles.planCatalogRow}>
                            <span style={styles.planCatalogName}>{p.name_he}</span>
                            <span style={styles.planCatalogPrice}>{formatPlanPriceDisplay(p)}</span>
                          </div>
                        ))}
                    </div>
                  </>
                ) : null}
              </div>
            </Card>

            <Card noPadding style={{ marginTop: '16px' }}>
              <div style={styles.cardPad}>
                <h2 style={styles.h2}>תוספים בתשלום</h2>
                <p style={styles.note}>
                  תוספים נרכשים בנפרד מהתוכנית הבסיסית (אנשי מקצוע, חתמת עובדים ועוד).
                </p>
                {!addonsReady ? (
                  <p style={styles.muted}>טוען תוספים...</p>
                ) : addons.length === 0 ? (
                  <p style={styles.muted}>אין תוספים במחירון — ודאו שהמיגרציות 046 ו-048 הורצו ב-Supabase.</p>
                ) : (
                  <p style={styles.note}>
                    {addons.filter((a) => a.enabled).length} מתוך {addons.length} תוספים פעילים בחשבון.
                  </p>
                )}
                <Link href="/addons" style={styles.addonsPageLink}>
                  לדף תוספים בתשלום — מחירון והפעלה
                </Link>
              </div>
            </Card>

            <Card noPadding style={{ marginTop: '16px' }}>
              <div style={styles.cardPad}>
                <p style={styles.note}>
                  חיוב חודשי לפי מסלול ומספר בניינים — כאן מוצגים נתוני שימוש. חשבוניות יתווספו בהמשך.
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
  addonsPageLink: {
    display: 'inline-block',
    marginTop: 12,
    fontSize: 14,
    fontWeight: 600,
    color: theme.colors.primary,
    textDecoration: 'none',
  },
  planCurrent: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    padding: 14,
    borderRadius: theme.radius.md,
    border: `1px solid ${theme.colors.border}`,
    background: theme.colors.primaryMuted,
  },
  planCurrentTitle: { fontSize: 17, fontWeight: 700, color: theme.colors.textPrimary },
  planCurrentDesc: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 4 },
  planCurrentPrice: { fontSize: 15, fontWeight: 600, color: theme.colors.primary, marginTop: 8 },
  planLimits: { fontSize: 12, color: theme.colors.textMuted, marginTop: 8 },
  planBadge: {
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: theme.radius.full,
    background: theme.colors.surface,
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
  },
  planCatalogList: { display: 'flex', flexDirection: 'column', gap: 8 },
  planCatalogRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderRadius: theme.radius.md,
    background: theme.colors.muted,
    fontSize: 14,
  },
  planCatalogName: { fontWeight: 500 },
  planCatalogPrice: { color: theme.colors.textSecondary, fontSize: 13 },
}
