'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { theme } from '@/app/components/ui'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import type { UsageAnalyticsReport } from '@/lib/usage-analytics'

const signalLabel: Record<string, string> = {
  core: 'ליבה',
  active: 'פעיל',
  low: 'חלש',
  unused: 'לא בשימוש',
}

const signalColor: Record<string, string> = {
  core: theme.colors.primary,
  active: '#0F766E',
  low: '#B45309',
  unused: theme.colors.error,
}

export function UsageAnalyticsPanel({ secret }: { secret: string }) {
  const [days, setDays] = useState(30)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [report, setReport] = useState<UsageAnalyticsReport | null>(null)
  const [showAllClients, setShowAllClients] = useState(false)

  const load = useCallback(async () => {
    if (!secret.trim()) return
    setLoading(true)
    setError(null)
    setExportMsg(null)
    try {
      const res = await fetchWithTimeout(
        `/api/superadmin/usage?days=${days}`,
        { headers: { 'x-admin-secret': secret } },
        60_000
      )
      const json = (await res.json()) as UsageAnalyticsReport & { error?: string }
      if (!res.ok) {
        setError(json.error ?? `שגיאה ${res.status}`)
        setReport(null)
        return
      }
      setReport(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בטעינה')
      setReport(null)
    } finally {
      setLoading(false)
    }
  }, [secret, days])

  const exportExcel = useCallback(async () => {
    if (!report) return
    setExporting(true)
    setExportMsg(null)
    setError(null)
    try {
      const { downloadUsageAnalyticsExcel } = await import('@/lib/usage-analytics-export')
      const filename = await downloadUsageAnalyticsExcel(report)
      setExportMsg(`הקובץ ירד: ${filename}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ייצוא Excel נכשל')
    } finally {
      setExporting(false)
    }
  }, [report])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: theme.colors.textPrimary }}>
            ניתוח שימוש בפיצ׳רים
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: theme.colors.textMuted }}>
            מבוסס על נתונים אמיתיים ב-DB (תקלות, דיירים, תוספים וכו׳) + כניסות ללשוניות כשיש מעקב
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={selectStyle}
            aria-label="חלון זמן"
          >
            <option value={7}>7 ימים</option>
            <option value={30}>30 ימים</option>
            <option value={90}>90 ימים</option>
          </select>
          <button type="button" onClick={() => void load()} disabled={loading} style={btnStyle}>
            {loading ? 'טוען…' : 'רענון'}
          </button>
          <button
            type="button"
            onClick={() => void exportExcel()}
            disabled={!report || loading || exporting}
            style={btnSecondaryStyle}
            title="ייצוא Excel של כל המיצוי (פיצ׳רים, לשוניות, לקוחות, תובנות)"
          >
            {exporting ? 'מייצא…' : 'ייצוא Excel'}
          </button>
        </div>
      </div>

      {exportMsg && (
        <div style={{ ...bannerStyle, background: theme.colors.primaryMuted, borderColor: theme.colors.border, color: theme.colors.textSecondary }}>
          {exportMsg}
        </div>
      )}

      {error && (
        <div style={{ ...bannerStyle, background: theme.colors.errorMuted, borderColor: theme.colors.error, color: theme.colors.error }}>
          {error}
        </div>
      )}

      {report && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <StatChip label="לקוחות" value={report.client_count} />
            <StatChip
              label="פיצ׳רים פעילים"
              value={report.features.filter((f) => f.signal === 'core' || f.signal === 'active').length}
            />
            <StatChip
              label="לא בשימוש"
              value={report.features.filter((f) => f.signal === 'unused').length}
            />
            <StatChip
              label="צפיות לשוניות"
              value={report.page_views.by_nav.reduce((s, r) => s + r.views, 0)}
            />
          </div>

          {report.insights.length > 0 && (
            <div style={{ ...bannerStyle, background: theme.colors.primaryMuted, borderColor: theme.colors.border }}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: theme.colors.primary }}>תובנות</div>
              <ul style={{ margin: 0, paddingInlineStart: 18, color: theme.colors.textSecondary, fontSize: 14, lineHeight: 1.6 }}>
                {report.insights.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          <section>
            <h3 style={sectionTitle}>דירוג פיצ׳רים (לפי פעילות בחלון)</h3>
            <div className="sa-usage-mobile-list">
              {report.features.slice(0, 8).map((f) => (
                <div key={f.key} className="sa-usage-row">
                  <div className="sa-usage-row-top">
                    <strong>
                      {f.rank}. {f.label}
                    </strong>
                    <span style={{ color: signalColor[f.signal] ?? theme.colors.textMuted, fontWeight: 600 }}>
                      {signalLabel[f.signal] ?? f.signal}
                    </span>
                  </div>
                  <div className="sa-usage-row-meta">
                    {f.clients_recent} לקוחות בחלון · {f.recent_events.toLocaleString('he-IL')} אירועים
                  </div>
                </div>
              ))}
            </div>
            <div className="sa-usage-desktop-table" style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={th}>#</th>
                    <th style={th}>פיצ׳ר / לשונית</th>
                    <th style={th}>סטטוס</th>
                    <th style={th}>לקוחות (חלון)</th>
                    <th style={th}>לקוחות (הכל)</th>
                    <th style={th}>אירועים (חלון)</th>
                    <th style={th}>אירועים (הכל)</th>
                  </tr>
                </thead>
                <tbody>
                  {report.features.map((f) => (
                    <tr key={f.key}>
                      <td style={td}>{f.rank}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{f.label}</td>
                      <td style={td}>
                        <span style={{ color: signalColor[f.signal] ?? theme.colors.textMuted, fontWeight: 600 }}>
                          {signalLabel[f.signal] ?? f.signal}
                        </span>
                      </td>
                      <td style={td}>{f.clients_recent}</td>
                      <td style={td}>{f.clients_ever}</td>
                      <td style={td}>{f.recent_events.toLocaleString('he-IL')}</td>
                      <td style={td}>{f.total_events.toLocaleString('he-IL')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 style={sectionTitle}>כניסות ללשוניות (page views)</h3>
            {!report.page_views.available || report.page_views.by_nav.length === 0 ? (
              <p style={{ color: theme.colors.textMuted, fontSize: 14 }}>{report.page_views.note}</p>
            ) : (
              <>
                <div className="sa-usage-mobile-list">
                  {report.page_views.by_nav.slice(0, 6).map((row) => (
                    <div key={row.nav_id} className="sa-usage-row">
                      <div className="sa-usage-row-top">
                        <strong>{row.label}</strong>
                        <span>{row.views.toLocaleString('he-IL')}</span>
                      </div>
                      <div className="sa-usage-row-meta">{row.clients} לקוחות</div>
                    </div>
                  ))}
                </div>
                <div className="sa-usage-desktop-table" style={{ overflowX: 'auto' }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={th}>לשונית</th>
                        <th style={th}>צפיות</th>
                        <th style={th}>לקוחות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.page_views.by_nav.map((row) => (
                        <tr key={row.nav_id}>
                          <td style={{ ...td, fontWeight: 600 }}>{row.label}</td>
                          <td style={td}>{row.views.toLocaleString('he-IL')}</td>
                          <td style={td}>{row.clients}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section>
            <h3 style={sectionTitle}>לקוחות — מה באמת רץ אצלם</h3>
            <div className="sa-usage-mobile-list">
              {(showAllClients ? report.clients : report.clients.slice(0, 5)).map((c) => (
                <div key={c.client_id} className="sa-usage-row">
                  <div className="sa-usage-row-top">
                    <strong>{c.name}</strong>
                    <span>{c.plan_tier ?? '—'}</span>
                  </div>
                  <div className="sa-usage-row-meta">
                    תקלה אחרונה:{' '}
                    {c.last_ticket_at ? new Date(c.last_ticket_at).toLocaleDateString('he-IL') : '—'}
                  </div>
                  <div className="sa-usage-row-meta">
                    פעיל: {c.active_features.length ? c.active_features.join(', ') : '—'}
                  </div>
                  {c.unused_enabled_addons.length > 0 ? (
                    <div className="sa-usage-row-meta" style={{ color: theme.colors.error }}>
                      תוספים בלי שימוש: {c.unused_enabled_addons.join(', ')}
                    </div>
                  ) : null}
                </div>
              ))}
              {report.clients.length > 5 ? (
                <button
                  type="button"
                  className="sa-quick-btn"
                  style={{ width: '100%', minHeight: 44 }}
                  onClick={() => setShowAllClients((v) => !v)}
                >
                  {showAllClients ? 'הצג פחות' : `הצג הכל (${report.clients.length})`}
                </button>
              ) : null}
            </div>
            <div className="sa-usage-desktop-table" style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={th}>לקוח</th>
                    <th style={th}>מסלול</th>
                    <th style={th}>תקלה אחרונה</th>
                    <th style={th}>פיצ׳רים פעילים (חלון)</th>
                    <th style={th}>תוספים בתשלום בלי שימוש</th>
                  </tr>
                </thead>
                <tbody>
                  {report.clients.map((c) => (
                    <tr key={c.client_id}>
                      <td style={{ ...td, fontWeight: 600 }}>{c.name}</td>
                      <td style={td}>{c.plan_tier ?? '—'}</td>
                      <td style={td}>
                        {c.last_ticket_at
                          ? new Date(c.last_ticket_at).toLocaleDateString('he-IL')
                          : '—'}
                      </td>
                      <td style={td}>{c.active_features.length ? c.active_features.join(', ') : '—'}</td>
                      <td style={{ ...td, color: c.unused_enabled_addons.length ? theme.colors.error : undefined }}>
                        {c.unused_enabled_addons.length ? c.unused_enabled_addons.join(', ') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        background: theme.colors.primaryMuted,
        borderRadius: theme.radius.md,
        padding: `${theme.spacing.md} ${theme.spacing.xl}`,
        textAlign: 'center',
        minWidth: 90,
      }}
    >
      <div style={{ fontSize: theme.typography.fontSize['2xl'], fontWeight: theme.typography.fontWeight.bold, color: theme.colors.primary }}>
        {value}
      </div>
      <div style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted }}>{label}</div>
    </div>
  )
}

const selectStyle: CSSProperties = {
  padding: '8px 12px',
  borderRadius: theme.radius.md,
  border: `1.5px solid ${theme.colors.border}`,
  background: theme.colors.surface,
  fontSize: 14,
}

const btnStyle: CSSProperties = {
  padding: '8px 14px',
  borderRadius: theme.radius.md,
  border: `1.5px solid ${theme.colors.primary}`,
  background: theme.colors.primary,
  color: '#fff',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
}

const btnSecondaryStyle: CSSProperties = {
  ...btnStyle,
  background: theme.colors.surface,
  color: theme.colors.primary,
}

const bannerStyle: CSSProperties = {
  border: '1.5px solid',
  borderRadius: theme.radius.md,
  padding: theme.spacing.lg,
}

const sectionTitle: CSSProperties = {
  margin: '0 0 10px',
  fontSize: 16,
  fontWeight: 700,
  color: theme.colors.textPrimary,
}

const tableStyle: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  background: theme.colors.surface,
  borderRadius: theme.radius.md,
  overflow: 'hidden',
  fontSize: 13,
}

const th: CSSProperties = {
  textAlign: 'right',
  padding: '10px 12px',
  borderBottom: `1px solid ${theme.colors.border}`,
  color: theme.colors.textMuted,
  fontWeight: 600,
  whiteSpace: 'nowrap',
}

const td: CSSProperties = {
  textAlign: 'right',
  padding: '10px 12px',
  borderBottom: `1px solid ${theme.colors.borderSubtle}`,
  color: theme.colors.textPrimary,
  verticalAlign: 'top',
}
