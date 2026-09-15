'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { theme } from '@/app/components/ui'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import type {
  OpsDataGap,
  OpsIntelligenceReport,
  OpsLearning,
  OpsSuggestion,
} from '@/lib/ops-intelligence-analytics'

const severityColor: Record<OpsLearning['severity'], string> = {
  good: '#0F766E',
  info: theme.colors.primary,
  warn: '#B45309',
}

const priorityColor: Record<OpsSuggestion['priority'], string> = {
  high: theme.colors.error,
  medium: '#B45309',
  low: theme.colors.textMuted,
}

const priorityLabel: Record<OpsSuggestion['priority'], string> = {
  high: 'גבוה',
  medium: 'בינוני',
  low: 'נמוך',
}

const gapLabel: Record<OpsDataGap['status'], string> = {
  ok: 'מוכן',
  thin: 'דל',
  missing: 'חסר',
}

const gapColor: Record<OpsDataGap['status'], string> = {
  ok: '#0F766E',
  thin: '#B45309',
  missing: theme.colors.error,
}

function fmtNum(n: number | null | undefined, suffix = ''): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toLocaleString('he-IL')}${suffix}`
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toLocaleString('he-IL')}%`
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('he-IL')
}

export function OpsIntelligencePanel({ secret }: { secret: string }) {
  const [days, setDays] = useState(90)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<OpsIntelligenceReport | null>(null)

  const load = useCallback(async () => {
    if (!secret.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetchWithTimeout(
        `/api/superadmin/ops-intelligence?days=${days}`,
        { headers: { 'x-admin-secret': secret } },
        90_000
      )
      const json = (await res.json()) as OpsIntelligenceReport & { error?: string }
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

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: theme.colors.textPrimary }}>
            זיכרון תפעולי — ניתוח בינה
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: theme.colors.textMuted, maxWidth: 640 }}>
            מה נאסף, מה אפשר כבר ללמוד מהנתונים (מדדי north-star), ואילו צעדים יקדמו המלצות / מניעה /
            הוכחת חיסכון. אנליטיקה היוריסטית — לא מודל ML מאומן.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={selectStyle}
            aria-label="חלון זמן"
          >
            <option value={30}>30 ימים</option>
            <option value={90}>90 ימים</option>
            <option value={180}>180 ימים</option>
            <option value={365}>שנה</option>
          </select>
          <button type="button" onClick={() => void load()} disabled={loading} style={btnStyle}>
            {loading ? 'טוען…' : 'רענון'}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            ...bannerStyle,
            background: theme.colors.errorMuted,
            borderColor: theme.colors.error,
            color: theme.colors.error,
          }}
        >
          {error}
        </div>
      )}

      {report && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <StatChip label="תקלות בחלון" value={report.inventory.tickets_in_window} />
            <StatChip label="תקלות פעילות (הכל)" value={report.inventory.tickets_active} />
            <StatChip label="לוגים" value={report.inventory.ticket_logs} />
            <StatChip label="בניינים" value={report.inventory.projects} />
            <StatChip label="דיירים" value={report.inventory.residents} />
            <StatChip label="ספקים" value={report.inventory.professionals} />
          </div>

          <section>
            <h3 style={sectionTitle}>מדדי north-star (מהנתונים)</h3>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
              <MetricCard
                label="זמן עד שיוך (ממוצע)"
                value={fmtNum(report.north_star.avg_hours_to_assignment, ' ש׳')}
                hint={
                  report.north_star.assignment_sample_size
                    ? `חציון ${fmtNum(report.north_star.median_hours_to_assignment, ' ש׳')} · n=${report.north_star.assignment_sample_size}`
                    : 'אין דגימות שיוך בלוג'
                }
              />
              <MetricCard
                label="זמן עד פתרון (ממוצע)"
                value={fmtNum(report.north_star.avg_hours_to_resolution, ' ש׳')}
                hint={
                  report.north_star.resolution_sample_size
                    ? `חציון ${fmtNum(report.north_star.median_hours_to_resolution, ' ש׳')} · n=${report.north_star.resolution_sample_size}`
                    : 'אין סגירות בחלון'
                }
              />
              <MetricCard
                label="שיעור תקלות חוזרות"
                value={fmtPct(report.north_star.recurring_rate_pct)}
                hint={`${report.north_star.recurring_count} מסומנות`}
              />
              <MetricCard
                label="כיסוי שיוך"
                value={fmtPct(report.north_star.assignment_coverage_pct)}
                hint={`${report.inventory.buildings_with_default_worker} בניינים עם עובד קבוע`}
              />
              <MetricCard
                label="% שיוך אוטומטי (פרוקסי ללא מנהל)"
                value={fmtPct(report.north_star.auto_assign_pct)}
                hint={
                  report.north_star.auto_assign_sample_size
                    ? `מתוך ${report.north_star.auto_assign_sample_size} שיוכים עם לוג`
                    : 'אין לוג שיוך'
                }
              />
              <MetricCard
                label="התראות / הסלמות SLA"
                value={`${fmtPct(report.north_star.sla_alert_rate_pct)} / ${fmtPct(report.north_star.escalation_rate_pct)}`}
                hint={`${report.north_star.sla_alerted_count} התראות · ${report.north_star.escalated_count} הסלמות`}
              />
              <MetricCard
                label="עלות תחזוקה לבניין"
                value="לא זמין"
                hint="חסרים שדות עלות לתקלה/ספק"
              />
            </div>
          </section>

          <section>
            <h3 style={sectionTitle}>מה אנחנו לומדים מהנתונים</h3>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {report.learnings.map((item) => (
                <li key={item.id} style={{ ...bannerStyle, borderColor: theme.colors.border }}>
                  <div style={{ fontWeight: 700, color: severityColor[item.severity], marginBottom: 4 }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 14, color: theme.colors.textSecondary, lineHeight: 1.55 }}>
                    {item.detail}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 style={sectionTitle}>הצעות לשיפור (לפי הנתונים)</h3>
            <div className="sa-usage-mobile-list">
              {report.suggestions.map((s) => (
                <div key={s.id} className="sa-usage-row">
                  <div className="sa-usage-row-top">
                    <strong>{s.title}</strong>
                    <span style={{ color: priorityColor[s.priority], fontWeight: 700 }}>
                      {priorityLabel[s.priority]}
                    </span>
                  </div>
                  <div className="sa-usage-row-meta">{s.rationale}</div>
                  <div className="sa-usage-row-meta" style={{ color: theme.colors.primary }}>
                    מדד: {s.north_star}
                  </div>
                </div>
              ))}
            </div>
            <div className="sa-usage-desktop-table" style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={th}>עדיפות</th>
                    <th style={th}>הצעה</th>
                    <th style={th}>למה (מהנתונים)</th>
                    <th style={th}>מדד north-star</th>
                  </tr>
                </thead>
                <tbody>
                  {report.suggestions.map((s) => (
                    <tr key={s.id}>
                      <td style={{ ...td, color: priorityColor[s.priority], fontWeight: 700 }}>
                        {priorityLabel[s.priority]}
                      </td>
                      <td style={{ ...td, fontWeight: 600 }}>{s.title}</td>
                      <td style={td}>{s.rationale}</td>
                      <td style={td}>{s.north_star}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 style={sectionTitle}>פערי נתונים ללמידה</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {report.inventory.data_gaps.map((g) => (
                <div
                  key={g.key}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    alignItems: 'baseline',
                    padding: '10px 12px',
                    border: `1px solid ${theme.colors.borderSubtle}`,
                    borderRadius: theme.radius.md,
                    background: theme.colors.surface,
                  }}
                >
                  <span style={{ fontWeight: 700, color: gapColor[g.status], minWidth: 52 }}>
                    {gapLabel[g.status]}
                  </span>
                  <strong style={{ color: theme.colors.textPrimary }}>{g.label}</strong>
                  <span style={{ fontSize: 13, color: theme.colors.textMuted }}>{g.detail}</span>
                </div>
              ))}
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 12, color: theme.colors.textMuted }}>
              תקופת נתונים: {fmtDate(report.inventory.first_ticket_at)} –{' '}
              {fmtDate(report.inventory.last_ticket_at)} · מקורות:{' '}
              {report.inventory.by_source.map((s) => `${s.source}=${s.count}`).join(', ') || '—'} · נוצר{' '}
              {new Date(report.generated_at).toLocaleString('he-IL')}
            </p>
          </section>

          <section>
            <h3 style={sectionTitle}>בניינים חמים</h3>
            {report.hot_buildings.length === 0 ? (
              <p style={{ color: theme.colors.textMuted, fontSize: 14 }}>אין מספיק נתונים בחלון.</p>
            ) : (
              <div className="sa-usage-desktop-table" style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={th}>בניין</th>
                      <th style={th}>לקוח</th>
                      <th style={th}>תקלות</th>
                      <th style={th}>חוזרות</th>
                      <th style={th}>ממוצע סגירה (ש׳)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.hot_buildings.map((b) => (
                      <tr key={b.project_id}>
                        <td style={{ ...td, fontWeight: 600 }}>{b.name}</td>
                        <td style={td}>{b.client_name}</td>
                        <td style={td}>{b.tickets}</td>
                        <td style={td}>{b.recurring}</td>
                        <td style={td}>{fmtNum(b.avg_hours_to_close)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h3 style={sectionTitle}>מדווחים חוזרים (≥3 בחלון)</h3>
            {report.repeat_reporters.length === 0 ? (
              <p style={{ color: theme.colors.textMuted, fontSize: 14 }}>לא זוהו מדווחים חוזרים בחלון.</p>
            ) : (
              <div className="sa-usage-desktop-table" style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={th}>טלפון</th>
                      <th style={th}>בניין</th>
                      <th style={th}>לקוח</th>
                      <th style={th}>תקלות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.repeat_reporters.map((r) => (
                      <tr key={`${r.phone}-${r.project_name}-${r.client_name}`}>
                        <td style={{ ...td, fontWeight: 600, direction: 'ltr' }}>{r.phone}</td>
                        <td style={td}>{r.project_name}</td>
                        <td style={td}>{r.client_name}</td>
                        <td style={td}>{r.tickets}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section>
            <h3 style={sectionTitle}>לקוחות בחלון</h3>
            <div className="sa-usage-desktop-table" style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={th}>לקוח</th>
                    <th style={th}>תקלות</th>
                    <th style={th}>סגורות</th>
                    <th style={th}>משויכות</th>
                    <th style={th}>חוזרות</th>
                    <th style={th}>SLA</th>
                    <th style={th}>ממוצע סגירה (ש׳)</th>
                  </tr>
                </thead>
                <tbody>
                  {report.clients.map((c) => (
                    <tr key={c.client_id}>
                      <td style={{ ...td, fontWeight: 600 }}>{c.name}</td>
                      <td style={td}>{c.tickets}</td>
                      <td style={td}>{c.closed}</td>
                      <td style={td}>{c.assigned}</td>
                      <td style={td}>{c.recurring}</td>
                      <td style={td}>{c.sla_alerted}</td>
                      <td style={td}>{fmtNum(c.avg_hours_to_close)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {report.monthly.length > 0 && (
            <section>
              <h3 style={sectionTitle}>מגמה חודשית (בחלון)</h3>
              <div className="sa-usage-desktop-table" style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={th}>חודש</th>
                      <th style={th}>נפתחו</th>
                      <th style={th}>נסגרו*</th>
                      <th style={th}>חוזרות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.monthly.map((m) => (
                      <tr key={m.month}>
                        <td style={{ ...td, fontWeight: 600 }}>{m.month}</td>
                        <td style={td}>{m.tickets}</td>
                        <td style={td}>{m.closed}</td>
                        <td style={td}>{m.recurring}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: theme.colors.textMuted }}>
                * סגורות = תקלות שנפתחו בחודש ונסגרו אי פעם (לא בהכרח באותו חודש).
              </p>
            </section>
          )}
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
      <div
        style={{
          fontSize: theme.typography.fontSize['2xl'],
          fontWeight: theme.typography.fontWeight.bold,
          color: theme.colors.primary,
        }}
      >
        {value.toLocaleString('he-IL')}
      </div>
      <div style={{ fontSize: theme.typography.fontSize.xs, color: theme.colors.textMuted }}>{label}</div>
    </div>
  )
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      style={{
        background: theme.colors.surface,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radius.md,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 12, color: theme.colors.textMuted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: theme.colors.textPrimary }}>{value}</div>
      {hint ? (
        <div style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 6, lineHeight: 1.4 }}>{hint}</div>
      ) : null}
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

const bannerStyle: CSSProperties = {
  border: '1.5px solid',
  borderRadius: theme.radius.md,
  padding: theme.spacing.lg,
  background: theme.colors.surface,
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
