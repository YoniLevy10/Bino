'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { theme } from '../components/ui'
import { LoadingButton } from '../components/LoadingButton'
import { formatPlanPriceIls, formatLimitHe } from '@/lib/plan-pricing'

export type PlanPricingRow = {
  plan_tier: string
  name_he: string
  description_he: string | null
  price_ils_monthly: number | null
  price_display_he: string | null
  buildings_max: number | null
  workers_max: number | null
  tickets_per_month_max: number | null
  sort_order: number
  is_active: boolean
}

type DraftPlan = {
  name: string
  desc: string
  price: string
  priceDisplay: string
  buildings: string
  workers: string
  tickets: string
}

const TIER_LABELS: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  business: 'Business',
  enterprise: 'Enterprise',
}

function parseOptionalInt(s: string): number | null {
  const t = s.trim()
  if (!t) return null
  const n = parseInt(t, 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Subscription tiers + setup fee — Super Admin. */
export function PlanPricingCatalogAdmin({ secret }: { secret: string }) {
  const [catalog, setCatalog] = useState<PlanPricingRow[]>([])
  const [setupFee, setSetupFee] = useState('10000')
  const [draft, setDraft] = useState<Record<string, DraftPlan>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/superadmin/plans/pricing', { headers: { 'x-admin-secret': secret } })
      const json = (await res.json()) as {
        catalog?: PlanPricingRow[]
        setup_fee_ils?: number
        error?: string
      }
      if (!res.ok) {
        setError(json.error || `שגיאה ${res.status}`)
        return
      }
      const rows = json.catalog || []
      setCatalog(rows)
      if (typeof json.setup_fee_ils === 'number') setSetupFee(String(json.setup_fee_ils))
      const d: Record<string, DraftPlan> = {}
      for (const r of rows) {
        d[r.plan_tier] = {
          name: r.name_he,
          desc: r.description_he || '',
          price: r.price_ils_monthly != null ? String(r.price_ils_monthly) : '',
          priceDisplay: r.price_display_he || '',
          buildings: r.buildings_max != null ? String(r.buildings_max) : '',
          workers: r.workers_max != null ? String(r.workers_max) : '',
          tickets: r.tickets_per_month_max != null ? String(r.tickets_per_month_max) : '',
        }
      }
      setDraft(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאת רשת')
    } finally {
      setLoading(false)
    }
  }, [secret])

  useEffect(() => {
    void load()
  }, [load])

  async function save() {
    setSaving(true)
    setError('')
    try {
      const setup = parseInt(setupFee, 10)
      const plans = catalog.map((row) => {
        const d = draft[row.plan_tier]
        const priceRaw = d?.price?.trim() ?? ''
        const price =
          priceRaw === '' ? null : parseInt(priceRaw, 10)
        return {
          plan_tier: row.plan_tier as 'starter' | 'pro' | 'business' | 'enterprise',
          name_he: d?.name?.trim() || row.name_he,
          description_he: d?.desc?.trim() || null,
          price_ils_monthly:
            price === null || !Number.isFinite(price) ? null : Math.max(0, price),
          price_display_he: d?.priceDisplay?.trim() || null,
          buildings_max: parseOptionalInt(d?.buildings ?? ''),
          workers_max: parseOptionalInt(d?.workers ?? ''),
          tickets_per_month_max: parseOptionalInt(d?.tickets ?? ''),
        }
      })

      const res = await fetch('/api/superadmin/plans/pricing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
        body: JSON.stringify({
          setup_fee_ils: Number.isFinite(setup) && setup >= 0 ? setup : 10000,
          plans,
        }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) {
        setError(json.error || 'שמירה נכשלה')
        return
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאת רשת')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="sa-panel" style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: theme.spacing.lg, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={titleStyle}>מנוי ותמחור — מסלולים</h2>
          <p style={subStyle}>
            מחיר חודשי לפי מסלול, מכסות עובדים/בניינים/תקלות (מאכפות ב-API), דמי הקמה חד-פעמיים, ותצוגה ללקוחות בדף חיוב.
            לדריסה ללקוח בודד — עריכת לקוח → מכסות override.
          </p>
        </div>
        <LoadingButton onClick={() => void save()} loading={saving} loadingText="שומר..." size="sm">
          שמור תמחור
        </LoadingButton>
      </div>

      <div style={{ marginBottom: theme.spacing.xl, maxWidth: 280 }}>
        <label style={labelStyle}>דמי הקמה (חד-פעמי, ₪)</label>
        <input
          type="number"
          min={0}
          value={setupFee}
          onChange={(e) => setSetupFee(e.target.value)}
          style={inputStyle}
          className="sa-input"
        />
        <div style={{ marginTop: 6, fontSize: 12, color: theme.colors.textMuted }}>
          תצוגה: {formatPlanPriceIls(parseInt(setupFee, 10) || 0)} הקמה
        </div>
      </div>

      {error ? <p style={{ color: theme.colors.error, fontSize: 13, marginBottom: 12 }}>{error}</p> : null}
      {loading ? (
        <p style={{ color: theme.colors.textMuted, fontSize: 14 }}>טוען תמחור...</p>
      ) : catalog.length === 0 ? (
        <p style={{ color: theme.colors.textMuted, fontSize: 14 }}>
          אין מסלולים — הריצו מיגרציה <code>049_plan_pricing_catalog.sql</code>
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: theme.spacing.lg }}>
          {catalog.map((row) => {
            const d = draft[row.plan_tier]
            const previewPrice =
              d?.priceDisplay?.trim() ||
              (d?.price?.trim() ? `${formatPlanPriceIls(parseInt(d.price, 10) || 0)}/חודש` : '—')
            return (
              <div key={row.plan_tier} style={rowStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>{TIER_LABELS[row.plan_tier] ?? row.plan_tier}</span>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: theme.colors.textMuted }}>{row.plan_tier}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                  <div>
                    <label style={labelStyle}>שם (עברית)</label>
                    <input
                      value={d?.name ?? ''}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [row.plan_tier]: { ...prev[row.plan_tier], name: e.target.value },
                        }))
                      }
                      style={inputStyle}
                      className="sa-input"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>מחיר / חודש (₪)</label>
                    <input
                      type="number"
                      min={0}
                      placeholder="ריק = מותאם"
                      value={d?.price ?? ''}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [row.plan_tier]: { ...prev[row.plan_tier], price: e.target.value },
                        }))
                      }
                      style={inputStyle}
                      className="sa-input"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>תצוגת מחיר (אופציונלי)</label>
                    <input
                      placeholder='למשל ₪899+'
                      value={d?.priceDisplay ?? ''}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [row.plan_tier]: { ...prev[row.plan_tier], priceDisplay: e.target.value },
                        }))
                      }
                      style={inputStyle}
                      className="sa-input"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>מקס. בניינים</label>
                    <input
                      placeholder="ריק = ללא הגבלה"
                      value={d?.buildings ?? ''}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [row.plan_tier]: { ...prev[row.plan_tier], buildings: e.target.value },
                        }))
                      }
                      style={inputStyle}
                      className="sa-input"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>מקס. עובדים</label>
                    <input
                      placeholder="ריק = ללא הגבלה"
                      value={d?.workers ?? ''}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [row.plan_tier]: { ...prev[row.plan_tier], workers: e.target.value },
                        }))
                      }
                      style={inputStyle}
                      className="sa-input"
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>מקס. תקלות/חודש</label>
                    <input
                      placeholder="ריק = ללא הגבלה"
                      value={d?.tickets ?? ''}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [row.plan_tier]: { ...prev[row.plan_tier], tickets: e.target.value },
                        }))
                      }
                      style={inputStyle}
                      className="sa-input"
                    />
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <label style={labelStyle}>תיאור (שיווקי)</label>
                  <input
                    value={d?.desc ?? ''}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        [row.plan_tier]: { ...prev[row.plan_tier], desc: e.target.value },
                      }))
                    }
                    style={inputStyle}
                    className="sa-input"
                  />
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: theme.colors.textMuted }}>
                  תצוגה ללקוח: {previewPrice} · בניינים: {formatLimitHe(parseOptionalInt(d?.buildings ?? ''))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const panelStyle: CSSProperties = {
  background: theme.colors.surface,
  borderRadius: theme.radius.xl,
  boxShadow: theme.shadows.md,
  padding: theme.spacing.xl,
  marginBottom: theme.spacing.xxl,
}

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: theme.typography.fontSize.xl,
  fontWeight: 700,
  color: theme.colors.textPrimary,
}

const subStyle: CSSProperties = {
  margin: '6px 0 0',
  fontSize: theme.typography.fontSize.sm,
  color: theme.colors.textMuted,
}

const rowStyle: CSSProperties = {
  padding: theme.spacing.lg,
  borderRadius: theme.radius.lg,
  border: `1px solid ${theme.colors.border}`,
  background: theme.colors.muted,
}

const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: theme.typography.fontSize.xs,
  color: theme.colors.textMuted,
  marginBottom: 4,
}

const inputStyle: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: theme.typography.fontSize.sm,
  border: `1.5px solid ${theme.colors.border}`,
  borderRadius: theme.radius.md,
  outline: 'none',
  background: theme.colors.surface,
  color: theme.colors.textPrimary,
  boxSizing: 'border-box',
}
