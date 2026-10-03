'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { fetchWithTimeout } from '@/lib/fetch-with-timeout'
import type { OpsIntelligenceReport, OpsSuggestion } from '@/lib/ops-intelligence-analytics'
import {
  buildBriefing,
  formatHoursHe,
  formatIls,
  type OpsAging,
  type OpsBreakdown,
  type OpsSlice,
  type OpsWorkerRow,
} from '@/lib/ops-intelligence-slices'

type Tone = 'good' | 'warn' | 'neutral'

const AGING_LABELS: { key: keyof OpsAging; label: string }[] = [
  { key: 'under_24h', label: 'עד 24 שע׳' },
  { key: 'd1_3', label: '1–3 ימים' },
  { key: 'd3_7', label: '3–7 ימים' },
  { key: 'd7_30', label: '7–30 ימים' },
  { key: 'over_30d', label: 'מעל 30 יום' },
]

type ClientSort = 'attention' | 'tickets' | 'resolution' | 'recurring' | 'open'

export function OpsIntelligencePanel({ secret }: { secret?: string }) {
  const [days, setDays] = useState(90)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<OpsIntelligenceReport | null>(null)
  const [clientId, setClientId] = useState('all')
  const [projectId, setProjectId] = useState('all')
  const [clientQuery, setClientQuery] = useState('')
  const [projectQuery, setProjectQuery] = useState('')
  const [clientSort, setClientSort] = useState<ClientSort>('attention')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchWithTimeout(
        `/api/superadmin/ops-intelligence?days=${days}`,
        { credentials: 'same-origin' },
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
  }, [days])

  useEffect(() => {
    void load()
  }, [load])

  const clientOptions = report?.clients ?? []
  const projectOptions = useMemo(() => {
    if (!report) return []
    return report.projects.filter((p) => clientId === 'all' || p.client_id === clientId)
  }, [report, clientId])

  useEffect(() => {
    if (projectId === 'all') return
    if (!projectOptions.some((p) => p.project_id === projectId)) setProjectId('all')
  }, [projectId, projectOptions])

  const scope = useMemo(() => {
    if (!report) return null
    const client = clientId === 'all' ? null : report.clients.find((c) => c.client_id === clientId) ?? null
    const project =
      projectId === 'all' ? null : report.projects.find((p) => p.project_id === projectId) ?? null
    const slice = project?.slice ?? client?.slice ?? report.portfolio
    const label = project?.name ?? client?.name ?? 'בכל המערכת'
    return { client, project, slice, label }
  }, [report, clientId, projectId])

  const visibleClients = useMemo(() => {
    if (!report) return []
    const q = clientQuery.trim()
    const rows = report.clients.filter((c) => !q || c.name.includes(q))
    const sorted = [...rows]
    sorted.sort((a, b) => {
      if (clientSort === 'tickets') return b.tickets - a.tickets
      if (clientSort === 'recurring') return b.slice.recurring_rate_pct - a.slice.recurring_rate_pct
      if (clientSort === 'open') return b.slice.open_now - a.slice.open_now
      if (clientSort === 'resolution') {
        const av = a.slice.median_hours_to_resolution ?? -1
        const bv = b.slice.median_hours_to_resolution ?? -1
        return bv - av
      }
      return b.attention_score - a.attention_score || b.tickets - a.tickets
    })
    return sorted
  }, [report, clientQuery, clientSort])

  const visibleProjects = useMemo(() => {
    const q = projectQuery.trim()
    return projectOptions.filter((p) => !q || p.name.includes(q) || p.client_name.includes(q))
  }, [projectOptions, projectQuery])

  const visibleWorkers: OpsWorkerRow[] = useMemo(() => {
    if (!report) return []
    if (projectId !== 'all') return report.workers_by_project.filter((w) => w.project_id === projectId)
    if (clientId !== 'all') return report.workers.filter((w) => w.client_id === clientId)
    return report.workers
  }, [report, clientId, projectId])

  const visibleReporters = useMemo(() => {
    if (!report) return []
    return report.repeat_reporters.filter((r) => {
      if (projectId !== 'all') return r.project_id === projectId
      if (clientId !== 'all') return r.client_id === clientId
      return true
    })
  }, [report, clientId, projectId])

  return (
    <div className="ops-dash">
      <header className="ops-head">
        <div>
          <h2 className="ops-title">ניתוח תפעולי</h2>
          <p className="ops-lead">
            חציון הוא המספר שמוביל. ממוצע ו-P90 מראים את הזנב. כל מדד מתעדכן לפי הלקוח והפרויקט שנבחרו.
          </p>
        </div>
        <div className="ops-head-actions">
          <label className="ops-field">
            <span>חלון</span>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="חלון זמן">
              <option value={30}>30 יום</option>
              <option value={90}>90 יום</option>
              <option value={180}>180 יום</option>
              <option value={365}>שנה</option>
            </select>
          </label>
          <button type="button" className="ops-btn" onClick={() => void load()} disabled={loading}>
            {loading ? 'טוען…' : 'רענון'}
          </button>
        </div>
      </header>

      {error ? <div className="ops-error">{error}</div> : null}

      {loading && !report ? <p className="ops-muted">מחשב מדדים מכל התקלות…</p> : null}

      {report && scope ? (
        <>
          <div className="ops-scope">
            <label className="ops-field">
              <span>לקוח</span>
              <select
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value)
                  setProjectId('all')
                }}
                aria-label="סינון לפי לקוח"
              >
                <option value="all">כל הלקוחות ({report.clients.length})</option>
                {clientOptions.map((c) => (
                  <option key={c.client_id} value={c.client_id}>
                    {c.name} · {c.tickets}
                  </option>
                ))}
              </select>
            </label>
            <label className="ops-field">
              <span>פרויקט</span>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                aria-label="סינון לפי פרויקט"
              >
                <option value="all">כל הפרויקטים ({projectOptions.length})</option>
                {projectOptions.map((p) => (
                  <option key={p.project_id} value={p.project_id}>
                    {p.name}
                    {clientId === 'all' ? ` · ${p.client_name}` : ''} · {p.slice.tickets}
                  </option>
                ))}
              </select>
            </label>
            {clientId !== 'all' || projectId !== 'all' ? (
              <button
                type="button"
                className="ops-btn ops-btn--ghost"
                onClick={() => {
                  setClientId('all')
                  setProjectId('all')
                }}
              >
                נקה סינון
              </button>
            ) : null}
            <p className="ops-generated">
              עודכן {new Date(report.generated_at).toLocaleString('he-IL')}
              {report.inventory.merged_excluded > 0
                ? ` · ${report.inventory.merged_excluded} תקלות ממוזגות הוצאו מהחישוב`
                : ''}
            </p>
          </div>

          <p className="ops-brief">{buildBriefing(scope.slice, report.lookback_days, scope.label)}</p>

          <section className="ops-kpis" aria-label="מדדי north-star">
            <Kpi
              label="זמן עד שיוך"
              value={formatHoursHe(scope.slice.median_hours_to_assignment)}
              hint={`חציון · ממוצע ${formatHoursHe(scope.slice.avg_hours_to_assignment)} · P90 ${formatHoursHe(scope.slice.p90_hours_to_assignment)} · n=${scope.slice.assignment_sample_size}`}
              tone={toneTime(scope.slice.median_hours_to_assignment, 4, 24)}
            />
            <Kpi
              label="זמן עד פתרון"
              value={formatHoursHe(scope.slice.median_hours_to_resolution)}
              hint={`חציון · ממוצע ${formatHoursHe(scope.slice.avg_hours_to_resolution)} · P90 ${formatHoursHe(scope.slice.p90_hours_to_resolution)} · n=${scope.slice.resolution_sample_size}`}
              tone={toneTime(scope.slice.median_hours_to_resolution, 24, 72)}
              extra={
                scope.client || scope.project ? (
                  <Delta hours={scope.slice.resolution_vs_portfolio_hours} />
                ) : null
              }
            />
            <Kpi
              label="תקלות חוזרות"
              value={fmtPct(scope.slice.recurring_rate_pct)}
              hint={`${scope.slice.recurring_count.toLocaleString('he-IL')} מתוך ${scope.slice.tickets.toLocaleString('he-IL')} בחלון`}
              tone={scope.slice.tickets === 0 ? 'neutral' : scope.slice.recurring_rate_pct >= 15 ? 'warn' : scope.slice.recurring_rate_pct <= 8 ? 'good' : 'neutral'}
            />
            <Kpi
              label="שיוך בלי מנהל"
              value={fmtPct(scope.slice.auto_assign_pct)}
              hint={
                scope.slice.auto_assign_sample_size
                  ? `${fmtPct(scope.slice.assignment_rate_pct)} מהתקלות שויכו · ${scope.slice.auto_assign_sample_size} עם לוג שיוך`
                  : 'אין לוג שיוך בחלון'
              }
              tone={
                scope.slice.auto_assign_pct == null
                  ? 'neutral'
                  : scope.slice.auto_assign_pct >= 50
                    ? 'good'
                    : scope.slice.auto_assign_pct < 25
                      ? 'warn'
                      : 'neutral'
              }
            />
            <Kpi
              label="חריגות SLA"
              value={fmtPct(scope.slice.sla_alert_rate_pct)}
              hint={`${scope.slice.sla_alerted_count.toLocaleString('he-IL')} התראות · ${fmtPct(scope.slice.escalation_rate_pct)} הוסלמו`}
              tone={scope.slice.sla_alert_rate_pct >= 20 ? 'warn' : 'neutral'}
            />
            <Kpi
              label="אומדן עלות עבודה"
              value={formatIls(scope.slice.labor_cost_estimate)}
              hint={
                scope.slice.labor_cost_estimate == null
                  ? 'אין תעריף שעתי על העובדים שסגרו תקלות'
                  : `${scope.slice.labor_priced_closed}/${scope.slice.labor_closed} סגירות עם תעריף · שעות עד סגירה × תעריף`
              }
              tone={scope.slice.labor_cost_estimate == null ? 'neutral' : 'neutral'}
            />
          </section>

          <div className="ops-split">
            <section className="ops-card">
              <h3>מה קרה לתקלות שנפתחו</h3>
              <FlowRow label="נפתחו" value={scope.slice.tickets} max={scope.slice.tickets} />
              <FlowRow label="שויכו לעובד" value={scope.slice.assigned} max={scope.slice.tickets} />
              <FlowRow label="נסגרו" value={scope.slice.closed} max={scope.slice.tickets} />
              <dl className="ops-mini">
                <div>
                  <dt>שיעור סגירה</dt>
                  <dd>{fmtPct(scope.slice.close_rate_pct)}</dd>
                </div>
                <div>
                  <dt>עדיין פתוחות מהחלון</dt>
                  <dd>{scope.slice.cohort_open.toLocaleString('he-IL')}</dd>
                </div>
                <div>
                  <dt>פתוחות עכשיו (כל הגילאים)</dt>
                  <dd>{scope.slice.open_now.toLocaleString('he-IL')}</dd>
                </div>
                <div>
                  <dt>פתוחות בלי שיוך</dt>
                  <dd>{scope.slice.unassigned_open.toLocaleString('he-IL')}</dd>
                </div>
              </dl>
            </section>

            <section className="ops-card">
              <h3>גיל התקלות הפתוחות עכשיו</h3>
              <AgingBars aging={scope.slice.open_aging} />
            </section>
          </div>

          <section className="ops-card">
            <h3>מגמה חודשית בחלון</h3>
            <MonthBars points={scope.slice.monthly} />
            <p className="ops-note">סגירות נספרות בחודש הפתיחה, גם אם נסגרו אחר כך.</p>
          </section>

          <div className="ops-mix">
            <MixCard title="סטטוס" rows={scope.slice.status_mix} />
            <MixCard title="עדיפות" rows={scope.slice.priority_mix} />
            <MixCard title="מקור פתיחה" rows={scope.slice.source_mix} />
          </div>

          <section className="ops-card">
            <div className="ops-card-head">
              <h3>לקוחות</h3>
              <div className="ops-card-tools">
                <input
                  value={clientQuery}
                  onChange={(e) => setClientQuery(e.target.value)}
                  placeholder="חיפוש לקוח"
                  aria-label="חיפוש לקוח"
                  className="ops-search"
                />
                <label className="ops-field">
                  <span>מיון</span>
                  <select
                    value={clientSort}
                    onChange={(e) => setClientSort(e.target.value as ClientSort)}
                    aria-label="מיון לקוחות"
                  >
                    <option value="attention">דורש תשומת לב</option>
                    <option value="tickets">נפח</option>
                    <option value="resolution">חציון פתרון</option>
                    <option value="recurring">שיעור חוזרות</option>
                    <option value="open">פתוחות עכשיו</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="ops-table-wrap">
              <table className="ops-table ops-table--click">
                <thead>
                  <tr>
                    <th>לקוח</th>
                    <th>נפח</th>
                    <th>חלק מהכל</th>
                    <th>פתוחות</th>
                    <th>בלי שיוך</th>
                    <th>חציון שיוך</th>
                    <th>חציון פתרון</th>
                    <th>מול הכל</th>
                    <th>סגירה</th>
                    <th>חוזרות</th>
                    <th>SLA</th>
                    <th>אומדן עבודה</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleClients.map((c) => (
                    <tr
                      key={c.client_id}
                      className={c.client_id === clientId ? 'ops-row--on' : undefined}
                      onClick={() => {
                        setClientId(c.client_id)
                        setProjectId('all')
                      }}
                    >
                      <td className="ops-strong">{c.name}</td>
                      <td className="ops-num">{c.tickets.toLocaleString('he-IL')}</td>
                      <td className="ops-num">{fmtPct(c.slice.share_of_portfolio_pct)}</td>
                      <td className="ops-num">{c.slice.open_now.toLocaleString('he-IL')}</td>
                      <td className="ops-num">{c.slice.unassigned_open.toLocaleString('he-IL')}</td>
                      <td className="ops-num">{formatHoursHe(c.slice.median_hours_to_assignment)}</td>
                      <td className="ops-num">{formatHoursHe(c.slice.median_hours_to_resolution)}</td>
                      <td><Delta hours={c.slice.resolution_vs_portfolio_hours} /></td>
                      <td className="ops-num">{fmtPct(c.slice.close_rate_pct)}</td>
                      <td className="ops-num">{fmtPct(c.slice.recurring_rate_pct)}</td>
                      <td className="ops-num">{fmtPct(c.slice.sla_alert_rate_pct)}</td>
                      <td className="ops-num">{formatIls(c.slice.labor_cost_estimate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visibleClients.length === 0 ? <p className="ops-muted">אין לקוחות עם תקלות בחלון.</p> : null}
            <p className="ops-note">לחיצה על שורה מסננת את כל הדשבורד ללקוח הזה. מיון «דורש תשומת לב» מעלה קודם פתוחות בלי שיוך, תקלות זקנות וחוזרות.</p>
          </section>

          <section className="ops-card">
            <div className="ops-card-head">
              <h3>פרויקטים {scope.client ? `· ${scope.client.name}` : ''}</h3>
              <input
                value={projectQuery}
                onChange={(e) => setProjectQuery(e.target.value)}
                placeholder="חיפוש פרויקט"
                aria-label="חיפוש פרויקט"
                className="ops-search"
              />
            </div>
            <div className="ops-table-wrap">
              <table className="ops-table ops-table--click">
                <thead>
                  <tr>
                    <th>פרויקט</th>
                    {clientId === 'all' ? <th>לקוח</th> : null}
                    <th>נפח</th>
                    <th>פתוחות</th>
                    <th>בלי שיוך</th>
                    <th>חציון שיוך</th>
                    <th>חציון פתרון</th>
                    <th>מול הכל</th>
                    <th>סגירה</th>
                    <th>חוזרות</th>
                    <th>P90 פתרון</th>
                    <th>עובד קבוע</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProjects.map((p) => (
                    <tr
                      key={p.project_id}
                      className={p.project_id === projectId ? 'ops-row--on' : undefined}
                      onClick={() => {
                        setProjectId(p.project_id)
                        if (p.client_id) setClientId(p.client_id)
                      }}
                    >
                      <td className="ops-strong">{p.name}</td>
                      {clientId === 'all' ? <td>{p.client_name}</td> : null}
                      <td className="ops-num">{p.slice.tickets.toLocaleString('he-IL')}</td>
                      <td className="ops-num">{p.slice.open_now.toLocaleString('he-IL')}</td>
                      <td className="ops-num">{p.slice.unassigned_open.toLocaleString('he-IL')}</td>
                      <td className="ops-num">{formatHoursHe(p.slice.median_hours_to_assignment)}</td>
                      <td className="ops-num">{formatHoursHe(p.slice.median_hours_to_resolution)}</td>
                      <td><Delta hours={p.slice.resolution_vs_portfolio_hours} /></td>
                      <td className="ops-num">{fmtPct(p.slice.close_rate_pct)}</td>
                      <td className="ops-num">{fmtPct(p.slice.recurring_rate_pct)}</td>
                      <td className="ops-num">{formatHoursHe(p.slice.p90_hours_to_resolution)}</td>
                      <td>{p.has_default_worker ? 'כן' : 'לא'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visibleProjects.length === 0 ? <p className="ops-muted">אין פרויקטים עם תקלות בטווח שנבחר.</p> : null}
          </section>

          <section className="ops-card">
            <h3>עובדים בטווח שנבחר</h3>
            {visibleWorkers.length === 0 ? (
              <p className="ops-muted">אין שיוכים לעובדים בטווח הזה.</p>
            ) : (
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>עובד</th>
                      {clientId === 'all' ? <th>לקוח</th> : null}
                      {projectId !== 'all' ? <th>פרויקט</th> : null}
                      <th>תקלות</th>
                      <th>נסגרו</th>
                      <th>שיעור סגירה</th>
                      <th>חציון פתרון</th>
                      <th>חוזרות</th>
                      <th>אומדן עבודה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleWorkers.map((w) => (
                      <tr key={`${w.worker_id}-${w.project_id ?? 'all'}`}>
                        <td className="ops-strong">{w.name}</td>
                        {clientId === 'all' ? <td>{w.client_name}</td> : null}
                        {projectId !== 'all' ? <td>{w.project_name}</td> : null}
                        <td className="ops-num">{w.tickets.toLocaleString('he-IL')}</td>
                        <td className="ops-num">{w.closed.toLocaleString('he-IL')}</td>
                        <td className="ops-num">{fmtPct(w.close_rate_pct)}</td>
                        <td className="ops-num">{formatHoursHe(w.median_hours_to_resolution)}</td>
                        <td className="ops-num">{w.recurring.toLocaleString('he-IL')}</td>
                        <td className="ops-num">{formatIls(w.labor_cost_estimate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="ops-note">חציון פתרון של עובד מחושב רק על תקלות שנסגרו עם חותמת זמן. אומדן העלות קיים רק כשיש תעריף שעתי.</p>
          </section>

          <details className="ops-fold">
            <summary>מדווחים חוזרים ({visibleReporters.length})</summary>
            {visibleReporters.length === 0 ? (
              <p className="ops-muted">אין טלפון עם 3 תקלות ומעלה בטווח.</p>
            ) : (
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>טלפון</th>
                      <th>פרויקט</th>
                      <th>לקוח</th>
                      <th>תקלות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleReporters.map((r) => (
                      <tr key={`${r.phone}-${r.project_id}`}>
                        <td className="ops-ltr">{r.phone}</td>
                        <td>{r.project_name}</td>
                        <td>{r.client_name}</td>
                        <td className="ops-num">{r.tickets}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </details>

          <details className="ops-fold">
            <summary>מה הנתונים אומרים ({report.learnings.length})</summary>
            <ul className="ops-learn">
              {report.learnings.map((item) => (
                <li key={item.id} data-sev={item.severity}>
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </li>
              ))}
            </ul>
          </details>

          <details className="ops-fold">
            <summary>הצעות לפי הנתונים ({report.suggestions.length})</summary>
            <ul className="ops-learn">
              {report.suggestions.map((s) => (
                <li key={s.id}>
                  <strong>
                    {priorityLabel[s.priority]} · {s.title}
                  </strong>
                  <span>{s.rationale}</span>
                  <span className="ops-note">מדד: {s.north_star}</span>
                </li>
              ))}
            </ul>
          </details>

          <details className="ops-fold">
            <summary>פערי נתונים</summary>
            <ul className="ops-gaps">
              {report.inventory.data_gaps.map((g) => (
                <li key={g.key} data-status={g.status}>
                  <b>{gapLabel[g.status]}</b>
                  <span>{g.label}</span>
                  <small>{g.detail}</small>
                </li>
              ))}
            </ul>
            <p className="ops-note">
              מלאי: {report.inventory.tickets_active.toLocaleString('he-IL')} תקלות פעילות ·{' '}
              {report.inventory.projects.toLocaleString('he-IL')} פרויקטים ·{' '}
              {report.inventory.residents.toLocaleString('he-IL')} דיירים ·{' '}
              {report.inventory.workers.toLocaleString('he-IL')} עובדים ·{' '}
              {report.inventory.professionals.toLocaleString('he-IL')} ספקים
            </p>
          </details>
        </>
      ) : null}
    </div>
  )
}

const priorityLabel: Record<OpsSuggestion['priority'], string> = {
  high: 'גבוה',
  medium: 'בינוני',
  low: 'נמוך',
}

const gapLabel = { ok: 'מוכן', thin: 'חלקי', missing: 'חסר' } as const

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toLocaleString('he-IL')}%`
}

function toneTime(median: number | null, goodMax: number, warnMin: number): Tone {
  if (median == null) return 'neutral'
  if (median <= goodMax) return 'good'
  if (median >= warnMin) return 'warn'
  return 'neutral'
}

function Kpi({
  label,
  value,
  hint,
  tone,
  extra,
}: {
  label: string
  value: string
  hint: string
  tone: Tone
  extra?: ReactNode
}) {
  return (
    <article className="ops-kpi" data-tone={tone}>
      <p className="ops-kpi-label">{label}</p>
      <p className="ops-kpi-value">{value}</p>
      {extra}
      <p className="ops-kpi-hint">{hint}</p>
    </article>
  )
}

function Delta({ hours }: { hours: number | null }) {
  if (hours == null || !Number.isFinite(hours)) return <span className="ops-delta">—</span>
  if (Math.abs(hours) < 0.05) return <span className="ops-delta">כמו החציון</span>
  const faster = hours < 0
  return (
    <span className={faster ? 'ops-delta ops-delta--good' : 'ops-delta ops-delta--warn'}>
      {faster ? 'מהיר ב־' : 'איטי ב־'}
      {formatHoursHe(Math.abs(hours))}
    </span>
  )
}

function FlowRow({ label, value, max }: { label: string; value: number; max: number }) {
  const width = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return (
    <div className="ops-flow">
      <div className="ops-flow-top">
        <span>{label}</span>
        <b>{value.toLocaleString('he-IL')}</b>
      </div>
      <div className="ops-track">
        <div className="ops-bar" style={{ width: `${value === 0 ? 0 : width}%` }} />
      </div>
    </div>
  )
}

function AgingBars({ aging }: { aging: OpsAging }) {
  const max = Math.max(1, ...AGING_LABELS.map((a) => aging[a.key]))
  const total = AGING_LABELS.reduce((s, a) => s + aging[a.key], 0)
  if (total === 0) return <p className="ops-muted">אין תקלות פתוחות בטווח הזה.</p>
  return (
    <div className="ops-aging">
      {AGING_LABELS.map((a) => (
        <div key={a.key} className="ops-age" data-bucket={a.key}>
          <div className="ops-flow-top">
            <span>{a.label}</span>
            <b>{aging[a.key].toLocaleString('he-IL')}</b>
          </div>
          <div className="ops-track">
            <div className="ops-bar" style={{ width: `${Math.round((aging[a.key] / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function MonthBars({ points }: { points: OpsSlice['monthly'] }) {
  if (points.length === 0) return <p className="ops-muted">אין פתיחות בחלון.</p>
  const max = Math.max(1, ...points.map((p) => Math.max(p.opened, p.closed)))
  return (
    <div className="ops-months" style={{ '--ops-months': String(points.length) } as CSSProperties}>
      {points.map((p) => (
        <div key={p.month} className="ops-month">
          <div className="ops-month-cols">
            <div className="ops-month-col ops-month-col--open" style={{ height: `${Math.round((p.opened / max) * 100)}%` }} title={`נפתחו ${p.opened}`} />
            <div className="ops-month-col ops-month-col--close" style={{ height: `${Math.round((p.closed / max) * 100)}%` }} title={`נסגרו ${p.closed}`} />
          </div>
          <span className="ops-month-label">{p.month.slice(2)}</span>
          <span className="ops-month-n">{p.opened}</span>
        </div>
      ))}
      <p className="ops-legend">
        <i className="ops-swatch ops-swatch--open" /> נפתחו
        <i className="ops-swatch ops-swatch--close" /> נסגרו
      </p>
    </div>
  )
}

function MixCard({ title, rows }: { title: string; rows: OpsBreakdown[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count))
  return (
    <section className="ops-card">
      <h3>{title}</h3>
      {rows.length === 0 ? <p className="ops-muted">אין נתונים.</p> : null}
      {rows.map((r) => (
        <div key={r.key} className="ops-flow">
          <div className="ops-flow-top">
            <span>{r.label}</span>
            <b>
              {r.count.toLocaleString('he-IL')} · {fmtPct(r.pct)}
            </b>
          </div>
          <div className="ops-track">
            <div className="ops-bar" style={{ width: `${Math.round((r.count / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </section>
  )
}
