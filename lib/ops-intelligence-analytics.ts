/**
 * Superadmin ops-intelligence report: north-star metrics from live ticket data,
 * derived learnings, and product improvement suggestions (BINO operational memory).
 *
 * This is descriptive analytics + heuristics — not a trained ML model.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'

export type OpsDataGap = {
  key: string
  label: string
  status: 'ok' | 'thin' | 'missing'
  detail: string
}

export type OpsLearning = {
  id: string
  title: string
  detail: string
  severity: 'info' | 'warn' | 'good'
}

export type OpsSuggestion = {
  id: string
  priority: 'high' | 'medium' | 'low'
  title: string
  rationale: string
  north_star: string
}

export type OpsIntelligenceReport = {
  generated_at: string
  lookback_days: number
  inventory: {
    tickets_active: number
    tickets_in_window: number
    tickets_closed_in_window: number
    ticket_logs: number
    clients: number
    projects: number
    residents: number
    workers: number
    professionals: number
    buildings_with_default_worker: number
    first_ticket_at: string | null
    last_ticket_at: string | null
    by_source: { source: string; count: number }[]
    data_gaps: OpsDataGap[]
  }
  north_star: {
    avg_hours_to_assignment: number | null
    median_hours_to_assignment: number | null
    assignment_sample_size: number
    assignment_coverage_pct: number
    auto_assign_pct: number | null
    auto_assign_sample_size: number
    avg_hours_to_resolution: number | null
    median_hours_to_resolution: number | null
    resolution_sample_size: number
    recurring_rate_pct: number
    recurring_count: number
    sla_alert_rate_pct: number
    sla_alerted_count: number
    escalation_rate_pct: number
    escalated_count: number
    maintenance_cost_available: boolean
    without_manager_proxy_pct: number | null
  }
  learnings: OpsLearning[]
  suggestions: OpsSuggestion[]
  hot_buildings: {
    project_id: string
    name: string
    client_name: string
    tickets: number
    recurring: number
    avg_hours_to_close: number | null
  }[]
  repeat_reporters: {
    phone: string
    client_name: string
    project_name: string
    tickets: number
  }[]
  clients: {
    client_id: string
    name: string
    tickets: number
    closed: number
    recurring: number
    assigned: number
    avg_hours_to_close: number | null
    sla_alerted: number
  }[]
  monthly: { month: string; tickets: number; closed: number; recurring: number }[]
}

type TicketRow = {
  id: string
  client_id: string | null
  project_id: string
  status: string
  created_at: string
  closed_at: string | null
  assigned_worker_id: string | null
  reporter_phone: string | null
  is_recurring: boolean | null
  sla_alerted: boolean | null
  escalated_at: string | null
  source: string | null
  source_channel: string | null
  ticket_metadata: unknown
}

type LogRow = {
  ticket_id: string
  action_type: string | null
  created_at: string
  meta: unknown
}

type ProjectRow = {
  id: string
  name: string | null
  client_id: string | null
  assigned_worker_id: string | null
}

type ClientRow = { id: string; name: string | null }

export function hoursBetween(startIso: string, endIso: string): number | null {
  const a = Date.parse(startIso)
  const b = Date.parse(endIso)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null
  return (b - a) / 3_600_000
}

export function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((x, y) => x - y)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2
  }
  return sorted[mid]!
}

export function avg(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((s, v) => s + v, 0) / values.length
}

export function round1(n: number | null): number | null {
  if (n == null || !Number.isFinite(n)) return null
  return Math.round(n * 10) / 10
}

export function pct(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 1000) / 10
}

function isAutoFromProjectMeta(meta: unknown): boolean {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false
  return (meta as { auto_from_project?: unknown }).auto_from_project === true
}

function sourceOf(t: TicketRow): string {
  const s = (t.source ?? t.source_channel ?? '').trim()
  return s || 'unknown'
}

function monthKey(iso: string): string {
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return 'unknown'
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export type OpsStatsInput = {
  lookbackDays: number
  ticketsAllActive: TicketRow[]
  ticketsInWindow: TicketRow[]
  logs: LogRow[]
  clients: ClientRow[]
  projects: ProjectRow[]
  residentsCount: number
  workersCount: number
  professionalsCount: number
  ticketLogsCount: number
}

/** Pure builder used by tests + `buildOpsIntelligenceReport`. */
export function buildOpsIntelligenceFromStats(input: OpsStatsInput): OpsIntelligenceReport {
  const {
    lookbackDays,
    ticketsAllActive,
    ticketsInWindow,
    logs,
    clients,
    projects,
    residentsCount,
    workersCount,
    professionalsCount,
    ticketLogsCount,
  } = input

  const clientName = new Map(clients.map((c) => [c.id, (c.name ?? '').trim() || 'ללא שם']))
  const projectName = new Map(projects.map((p) => [p.id, (p.name ?? '').trim() || 'ללא שם']))
  const projectClient = new Map(projects.map((p) => [p.id, p.client_id]))

  const createdByTicket = new Map(ticketsInWindow.map((t) => [t.id, t.created_at]))
  const assignHours: number[] = []
  let autoAssign = 0
  let assignEvents = 0

  for (const log of logs) {
    if (log.action_type !== 'ASSIGNED_TO_WORKER') continue
    const created = createdByTicket.get(log.ticket_id)
    if (!created) continue
    const h = hoursBetween(created, log.created_at)
    if (h == null) continue
    assignHours.push(h)
    assignEvents += 1
    if (isAutoFromProjectMeta(log.meta)) autoAssign += 1
  }

  const resolutionHours = ticketsInWindow
    .filter((t) => t.closed_at)
    .map((t) => hoursBetween(t.created_at, t.closed_at!))
    .filter((h): h is number => h != null)

  const closedInWindow = ticketsInWindow.filter((t) => t.closed_at).length
  const assignedInWindow = ticketsInWindow.filter((t) => t.assigned_worker_id).length
  const recurringCount = ticketsInWindow.filter((t) => t.is_recurring === true).length
  const slaAlerted = ticketsInWindow.filter((t) => t.sla_alerted === true).length
  const escalated = ticketsInWindow.filter((t) => t.escalated_at != null).length
  const withMetadata = ticketsInWindow.filter((t) => {
    if (t.ticket_metadata == null) return false
    if (typeof t.ticket_metadata === 'object' && !Array.isArray(t.ticket_metadata)) {
      return Object.keys(t.ticket_metadata as object).length > 0
    }
    return true
  }).length

  const bySourceMap = new Map<string, number>()
  for (const t of ticketsInWindow) {
    const s = sourceOf(t)
    bySourceMap.set(s, (bySourceMap.get(s) ?? 0) + 1)
  }
  const by_source = [...bySourceMap.entries()]
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count)

  const first = ticketsAllActive.reduce<string | null>((min, t) => {
    if (!min || t.created_at < min) return t.created_at
    return min
  }, null)
  const last = ticketsAllActive.reduce<string | null>((max, t) => {
    if (!max || t.created_at > max) return t.created_at
    return max
  }, null)

  const buildingsWithDefaultWorker = projects.filter((p) => p.assigned_worker_id).length
  const windowN = ticketsInWindow.length

  const north_star = {
    avg_hours_to_assignment: round1(avg(assignHours)),
    median_hours_to_assignment: round1(median(assignHours)),
    assignment_sample_size: assignHours.length,
    assignment_coverage_pct: pct(assignedInWindow, windowN),
    auto_assign_pct: assignEvents > 0 ? pct(autoAssign, assignEvents) : null,
    auto_assign_sample_size: assignEvents,
    avg_hours_to_resolution: round1(avg(resolutionHours)),
    median_hours_to_resolution: round1(median(resolutionHours)),
    resolution_sample_size: resolutionHours.length,
    recurring_rate_pct: pct(recurringCount, windowN),
    recurring_count: recurringCount,
    sla_alert_rate_pct: pct(slaAlerted, windowN),
    sla_alerted_count: slaAlerted,
    escalation_rate_pct: pct(escalated, windowN),
    escalated_count: escalated,
    maintenance_cost_available: false,
    without_manager_proxy_pct: assignEvents > 0 ? pct(autoAssign, assignEvents) : null,
  }

  const data_gaps: OpsDataGap[] = [
    {
      key: 'tickets',
      label: 'תקלות + לוגים',
      status: windowN >= 50 ? 'ok' : windowN >= 10 ? 'thin' : 'missing',
      detail:
        windowN >= 50
          ? `${windowN} תקלות בחלון — מספיק לדפוסים בסיסיים`
          : windowN >= 10
            ? `${windowN} תקלות בחלון — מדגם דק ללמידה`
            : `${windowN} תקלות בחלון — לא מספיק ללמידה`,
    },
    {
      key: 'assigned_at',
      label: 'זמן עד שיוך',
      status: assignHours.length >= 20 ? 'ok' : assignHours.length > 0 ? 'thin' : 'missing',
      detail:
        assignHours.length > 0
          ? `מחושב מ-${assignHours.length} אירועי ASSIGNED_TO_WORKER בלוג (אין עמודת assigned_at)`
          : 'אין אירועי שיוך בלוג בחלון — לא ניתן לחשב זמן עד שיוך',
    },
    {
      key: 'cost',
      label: 'עלות תחזוקה לבניין',
      status: 'missing',
      detail: 'אין עלות לתקלה / ספק — המדד north-star לא ניתן לחישוב',
    },
    {
      key: 'professionals',
      label: 'אנשי מקצוע / ספקים',
      status: professionalsCount > 0 ? 'ok' : 'missing',
      detail:
        professionalsCount > 0
          ? `${professionalsCount} אנשי מקצוע בקטלוג`
          : '0 אנשי מקצוע — אין בסיס להמלצת ספק',
    },
    {
      key: 'metadata',
      label: 'ticket_metadata מובנה',
      status: withMetadata > 0 ? 'thin' : 'missing',
      detail:
        withMetadata > 0
          ? `${withMetadata}/${windowN} תקלות עם metadata`
          : 'כל התקלות בחלון עם metadata ריק — אין טקסונומיית תקלה מובנית',
    },
    {
      key: 'equipment',
      label: 'ציוד / מערכות בניין',
      status: 'missing',
      detail: 'אין מלאי ציוד — לא ניתן לחזות כשל מערכת',
    },
    {
      key: 'default_worker',
      label: 'עובד ברירת מחדל לבניין',
      status:
        projects.length === 0
          ? 'missing'
          : buildingsWithDefaultWorker / projects.length >= 0.5
            ? 'ok'
            : buildingsWithDefaultWorker > 0
              ? 'thin'
              : 'missing',
      detail: `${buildingsWithDefaultWorker}/${projects.length} בניינים עם עובד קבוע`,
    },
  ]

  const inventory = {
    tickets_active: ticketsAllActive.length,
    tickets_in_window: windowN,
    tickets_closed_in_window: closedInWindow,
    ticket_logs: ticketLogsCount,
    clients: clients.length,
    projects: projects.length,
    residents: residentsCount,
    workers: workersCount,
    professionals: professionalsCount,
    buildings_with_default_worker: buildingsWithDefaultWorker,
    first_ticket_at: first,
    last_ticket_at: last,
    by_source,
    data_gaps,
  }

  // Hot buildings (window)
  const byProject = new Map<string, TicketRow[]>()
  for (const t of ticketsInWindow) {
    const list = byProject.get(t.project_id) ?? []
    list.push(t)
    byProject.set(t.project_id, list)
  }
  const hot_buildings = [...byProject.entries()]
    .map(([project_id, list]) => {
      const cid = list[0]?.client_id ?? projectClient.get(project_id) ?? null
      const closeHours = list
        .filter((t) => t.closed_at)
        .map((t) => hoursBetween(t.created_at, t.closed_at!))
        .filter((h): h is number => h != null)
      return {
        project_id,
        name: projectName.get(project_id) ?? 'ללא שם',
        client_name: cid ? clientName.get(cid) ?? '—' : '—',
        tickets: list.length,
        recurring: list.filter((t) => t.is_recurring === true).length,
        avg_hours_to_close: round1(avg(closeHours)),
      }
    })
    .sort((a, b) => b.tickets - a.tickets || b.recurring - a.recurring)
    .slice(0, 10)

  // Repeat reporters (same phone + project, ≥3 in window)
  const reporterKey = new Map<string, { phone: string; client_id: string | null; project_id: string; n: number }>()
  for (const t of ticketsInWindow) {
    const phone = (t.reporter_phone ?? '').trim()
    if (!phone) continue
    const key = `${t.client_id ?? ''}|${t.project_id}|${phone}`
    const cur = reporterKey.get(key)
    if (cur) cur.n += 1
    else reporterKey.set(key, { phone, client_id: t.client_id, project_id: t.project_id, n: 1 })
  }
  const repeat_reporters = [...reporterKey.values()]
    .filter((r) => r.n >= 3)
    .sort((a, b) => b.n - a.n)
    .slice(0, 15)
    .map((r) => ({
      phone: r.phone,
      client_name: r.client_id ? clientName.get(r.client_id) ?? '—' : '—',
      project_name: projectName.get(r.project_id) ?? '—',
      tickets: r.n,
    }))

  const clientsOut = clients
    .map((c) => {
      const list = ticketsInWindow.filter((t) => t.client_id === c.id)
      const closeHours = list
        .filter((t) => t.closed_at)
        .map((t) => hoursBetween(t.created_at, t.closed_at!))
        .filter((h): h is number => h != null)
      return {
        client_id: c.id,
        name: clientName.get(c.id) ?? '—',
        tickets: list.length,
        closed: list.filter((t) => t.closed_at).length,
        recurring: list.filter((t) => t.is_recurring === true).length,
        assigned: list.filter((t) => t.assigned_worker_id).length,
        avg_hours_to_close: round1(avg(closeHours)),
        sla_alerted: list.filter((t) => t.sla_alerted === true).length,
      }
    })
    .filter((c) => c.tickets > 0)
    .sort((a, b) => b.tickets - a.tickets)

  const monthMap = new Map<string, { tickets: number; closed: number; recurring: number }>()
  for (const t of ticketsInWindow) {
    const m = monthKey(t.created_at)
    const cur = monthMap.get(m) ?? { tickets: 0, closed: 0, recurring: 0 }
    cur.tickets += 1
    if (t.closed_at) cur.closed += 1
    if (t.is_recurring) cur.recurring += 1
    monthMap.set(m, cur)
  }
  const monthly = [...monthMap.entries()]
    .map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => a.month.localeCompare(b.month))

  const learnings = buildLearnings({
    windowN,
    north_star,
    hot_buildings,
    repeat_reporters,
    by_source,
    buildingsWithDefaultWorker,
    projectsCount: projects.length,
    professionalsCount,
    withMetadata,
  })

  const suggestions = buildSuggestions({
    windowN,
    north_star,
    hot_buildings,
    repeat_reporters,
    buildingsWithDefaultWorker,
    projectsCount: projects.length,
    professionalsCount,
    withMetadata,
    data_gaps,
  })

  return {
    generated_at: new Date().toISOString(),
    lookback_days: lookbackDays,
    inventory,
    north_star,
    learnings,
    suggestions,
    hot_buildings,
    repeat_reporters,
    clients: clientsOut,
    monthly,
  }
}

export function buildLearnings(ctx: {
  windowN: number
  north_star: OpsIntelligenceReport['north_star']
  hot_buildings: OpsIntelligenceReport['hot_buildings']
  repeat_reporters: OpsIntelligenceReport['repeat_reporters']
  by_source: { source: string; count: number }[]
  buildingsWithDefaultWorker: number
  projectsCount: number
  professionalsCount: number
  withMetadata: number
}): OpsLearning[] {
  const out: OpsLearning[] = []
  const ns = ctx.north_star

  if (ctx.windowN === 0) {
    out.push({
      id: 'no-data',
      title: 'אין תקלות בחלון הזמן',
      detail: 'עדיין אין מה ללמוד — צריך נפח מינימלי של תקלות סגורות ומשויכות.',
      severity: 'warn',
    })
    return out
  }

  out.push({
    id: 'volume',
    title: `נאספו ${ctx.windowN} תקלות בחלון`,
    detail:
      ctx.windowN >= 100
        ? 'נפח סביר להתחלת דפוסים לפי בניין / מדווח / זמני טיפול.'
        : 'המדגם עדיין קטן ל-ML — מתאים לכללים והיוריסטיקות, לא למודל מאומן.',
    severity: ctx.windowN >= 100 ? 'good' : 'info',
  })

  if (ns.avg_hours_to_resolution != null) {
    out.push({
      id: 'ttr',
      title: `ממוצע זמן עד פתרון: ${ns.avg_hours_to_resolution} שעות`,
      detail:
        ns.median_hours_to_resolution != null
          ? `חציון ${ns.median_hours_to_resolution} ש׳ על ${ns.resolution_sample_size} תקלות סגורות. זה מדד north-star שכבר ניתן לחשב מהנתונים.`
          : `מבוסס על ${ns.resolution_sample_size} תקלות סגורות.`,
      severity: ns.avg_hours_to_resolution > 48 ? 'warn' : 'good',
    })
  } else {
    out.push({
      id: 'ttr-missing',
      title: 'אין מספיק סגירות לזמן-עד-פתרון',
      detail: 'סגרו תקלות עם closed_at כדי למדוד את המדד.',
      severity: 'warn',
    })
  }

  if (ns.assignment_sample_size > 0 && ns.avg_hours_to_assignment != null) {
    out.push({
      id: 'tta',
      title: `ממוצע זמן עד שיוך (מלוגים): ${ns.avg_hours_to_assignment} שעות`,
      detail: `חציון ${ns.median_hours_to_assignment ?? '—'} ש׳ · ${ns.assignment_sample_size} אירועי שיוך. פרוקסי בלבד עד שתהיה עמודת assigned_at.`,
      severity: ns.avg_hours_to_assignment > 4 ? 'warn' : 'good',
    })
  }

  out.push({
    id: 'assign-coverage',
    title: `כיסוי שיוך: ${ns.assignment_coverage_pct}%`,
    detail: `${ctx.buildingsWithDefaultWorker}/${ctx.projectsCount} בניינים עם עובד קבוע — השיוך היום הוא קונפיג, לא המלצה מלומדת.`,
    severity: ns.assignment_coverage_pct >= 80 ? 'good' : 'warn',
  })

  if (ns.auto_assign_pct != null) {
    out.push({
      id: 'auto-assign',
      title: `${ns.auto_assign_pct}% מהשיוכים היו אוטומטיים מבניין`,
      detail: 'פרוקסי ל־"% ללא התערבות מנהל" — רק שיבוץ אוטומטי מפרויקט, לא סגירה אוטונומית.',
      severity: ns.auto_assign_pct >= 50 ? 'good' : 'info',
    })
  }

  out.push({
    id: 'recurring',
    title: `שיעור תקלות חוזרות: ${ns.recurring_rate_pct}% (${ns.recurring_count})`,
    detail:
      ns.recurring_count > 0
        ? 'הדגל is_recurring נכתב ב-WhatsApp (≥3 מאותו טלפון+בניין/30 יום) — עדיין בלי UI/פעולה אוטומטית.'
        : 'לא סומנו תקלות חוזרות בחלון (או שהנתיב לא רץ על כל מקורות הפתיחה).',
    severity: ns.recurring_rate_pct >= 15 ? 'warn' : 'info',
  })

  if (ns.sla_alerted_count > 0 || ns.escalated_count > 0) {
    out.push({
      id: 'sla',
      title: `SLA: ${ns.sla_alert_rate_pct}% התראות · ${ns.escalation_rate_pct}% הסלמות`,
      detail: 'התראות אחרי חריגה (לא חיזוי מוקדם). יש אות תוצאה שאפשר ללמוד ממנו ספי סיכון.',
      severity: ns.sla_alert_rate_pct >= 20 ? 'warn' : 'info',
    })
  }

  if (ctx.hot_buildings[0] && ctx.hot_buildings[0].tickets >= 5) {
    const top = ctx.hot_buildings[0]
    out.push({
      id: 'hot-building',
      title: `בניין חם: ${top.name} (${top.client_name}) — ${top.tickets} תקלות`,
      detail:
        top.recurring > 0
          ? `מתוכן ${top.recurring} מסומנות חוזרות — מועמד לטיפול מונע / ביקורת מערכת.`
          : 'ריכוז נפח גבוה — כדאי לבדוק דפוס תיאורים ומערכות.',
      severity: 'warn',
    })
  }

  if (ctx.repeat_reporters.length > 0) {
    const top = ctx.repeat_reporters[0]!
    out.push({
      id: 'repeat-reporter',
      title: `${ctx.repeat_reporters.length} מדווחים חוזרים (≥3 תקלות)`,
      detail: `הבולט: ${top.phone} ב־${top.project_name} (${top.tickets}×) — סימן לבעיה מבנית ולא תקלה חד־פעמית.`,
      severity: 'warn',
    })
  }

  const topSource = ctx.by_source[0]
  if (topSource) {
    out.push({
      id: 'source-mix',
      title: `מקור דומיננטי: ${topSource.source} (${topSource.count})`,
      detail:
        ctx.by_source.length === 1
          ? 'כל התקלות ממקור אחד — הזיכרון התפעולי עדיין צר (חסר ערוץ ווב/טלפון וכו׳).'
          : `פיזור: ${ctx.by_source.map((s) => `${s.source}=${s.count}`).join(', ')}`,
      severity: ctx.by_source.length === 1 ? 'info' : 'good',
    })
  }

  if (ctx.professionalsCount === 0) {
    out.push({
      id: 'no-vendors',
      title: 'אין אנשי מקצוע במערכת',
      detail: 'בלי ספקים + תוצאות עבודה — אי אפשר להמליץ ספק לפי היסטוריה.',
      severity: 'warn',
    })
  }

  if (ctx.withMetadata === 0) {
    out.push({
      id: 'no-taxonomy',
      title: 'אין סיווג מובנה לתקלות',
      detail: 'ticket_metadata ריק — הלמידה נשענת על טקסט חופשי בלבד (חלש לחיזוי/המלצה).',
      severity: 'warn',
    })
  }

  out.push({
    id: 'cost-gap',
    title: 'עלות תחזוקה לבניין — לא נמדדת',
    detail: 'חסרים עלות לתקלה / חשבונית ספק. בלי זה אי אפשר להוכיח חיסכון בכסף.',
    severity: 'warn',
  })

  return out
}

export function buildSuggestions(ctx: {
  windowN: number
  north_star: OpsIntelligenceReport['north_star']
  hot_buildings: OpsIntelligenceReport['hot_buildings']
  repeat_reporters: OpsIntelligenceReport['repeat_reporters']
  buildingsWithDefaultWorker: number
  projectsCount: number
  professionalsCount: number
  withMetadata: number
  data_gaps: OpsDataGap[]
}): OpsSuggestion[] {
  const out: OpsSuggestion[] = []
  const ns = ctx.north_star

  out.push({
    id: 'surface-recurring',
    priority: ns.recurring_count > 0 ? 'high' : 'medium',
    title: 'הצג is_recurring בדשבורד + התראת מנהל',
    rationale:
      ns.recurring_count > 0
        ? `כבר סומנו ${ns.recurring_count} תקלות חוזרות — הדגל נכתב ולא נצרך ב-UI.`
        : 'הדגל כבר נכתב ב-WhatsApp; בלי משטח מוצר אין ערך תפעולי.',
    north_star: 'שיעור תקלות חוזרות',
  })

  out.push({
    id: 'wire-preventive-cron',
    priority: 'high',
    title: 'חבר את cron preventive-maintenance ל־vercel.json',
    rationale: 'הקוד כבר מזהה נפח גבוה / מדווחים חוזרים / מילות מפתח — אבל לא מתוזמן בפרודקשן.',
    north_star: 'מניעת כשל / התרעה מוקדמת',
  })

  out.push({
    id: 'assigned-at-column',
    priority: 'high',
    title: 'הוסף assigned_at (או first_assigned_at) לתקלות',
    rationale:
      ns.assignment_sample_size > 0
        ? 'זמן-עד-שיוך מחושב מלוגים — שברירי ולא אחיד. עמודה ייעודית תייצב את מדד north-star.'
        : 'בלי חותמת שיוך אמינה אי אפשר למדוד זמן עד שיוך.',
    north_star: 'זמן עד שיוך',
  })

  if (ctx.buildingsWithDefaultWorker < ctx.projectsCount) {
    out.push({
      id: 'fill-default-workers',
      priority: 'medium',
      title: 'השלם עובד קבוע לכל בניין',
      rationale: `${ctx.buildingsWithDefaultWorker}/${ctx.projectsCount} בניינים מוגדרים — זה מקצר זמן שיוך מיד בלי ML.`,
      north_star: 'זמן עד שיוך · % ללא מנהל',
    })
  }

  if (ctx.professionalsCount === 0) {
    out.push({
      id: 'seed-professionals',
      priority: 'high',
      title: 'הזן אנשי מקצוע + תוצאת עבודה לתקלה',
      rationale: 'בלי ספקים ותוצאות — אין בסיס להמלצת ספק אוטומטית.',
      north_star: 'המלצת ספק · עלות תחזוקה',
    })
  }

  out.push({
    id: 'ticket-cost',
    priority: 'high',
    title: 'שמור עלות / חשבונית על תקלה או בניין',
    rationale: 'בלי עלות אי אפשר להוכיח לחברת הניהול כמה כסף נחסך.',
    north_star: 'עלות תחזוקה לבניין',
  })

  out.push({
    id: 'issue-taxonomy',
    priority: ctx.withMetadata === 0 ? 'high' : 'medium',
    title: 'סיווג תקלה מובנה (מערכת / קטגוריה / ציוד)',
    rationale: 'טקסט חופשי בלבד מקשה על זיהוי תקלות חוזרות וחיזוי כשל. metadata או enum יאפשרו למידה.',
    north_star: 'תקלות חוזרות · חיזוי כשל',
  })

  if (ctx.hot_buildings[0] && ctx.hot_buildings[0].tickets >= 5) {
    const top = ctx.hot_buildings[0]
    out.push({
      id: 'inspect-hot-building',
      priority: 'medium',
      title: `בדוק את ${top.name} — מועמד לטיפול מונע`,
      rationale: `${top.tickets} תקלות בחלון${top.recurring ? ` · ${top.recurring} חוזרות` : ''}.`,
      north_star: 'מניעת כשל · שיעור חוזרות',
    })
  }

  if (ctx.repeat_reporters.length > 0) {
    out.push({
      id: 'act-on-repeat-reporters',
      priority: 'medium',
      title: 'צור משימת שורש למדווחים חוזרים',
      rationale: `${ctx.repeat_reporters.length} טלפונים עם ≥3 תקלות — סימן לבעיה מבנית בבניין.`,
      north_star: 'שיעור תקלות חוזרות',
    })
  }

  if (ns.avg_hours_to_resolution != null && ns.avg_hours_to_resolution > 48) {
    out.push({
      id: 'sla-tuning',
      priority: 'medium',
      title: 'כוונן sla_hours לפי ביצועים אמיתיים לבניין',
      rationale: `ממוצע סגירה ${ns.avg_hours_to_resolution} ש׳ — סף אחיד של 24ש׳ יוצר רעש התראות במקום חיזוי.`,
      north_star: 'התרעת SLA מוקדמת',
    })
  }

  out.push({
    id: 'recommend-worker-v1',
    priority: 'medium',
    title: 'המלצת עובד v1: היסטוריית סגירות לפי קטגוריה+בניין',
    rationale: 'אחרי שיש סיווג + מספיק סגירות — דירוג עובד לפי זמן-עד-פתרון (לא רק עובד קבוע).',
    north_star: 'זמן עד שיוך · זמן עד פתרון',
  })

  if (ctx.windowN < 100) {
    out.push({
      id: 'grow-volume',
      priority: 'low',
      title: 'הגדל נפח אותות (עוד לקוחות / ערוצים)',
      rationale: `${ctx.windowN} תקלות בחלון — ML קלאסי ידרוש סדרי גודל יותר; בינתיים כללים + אנליטיקה.`,
      north_star: 'זיכרון תפעולי',
    })
  }

  const priorityRank = { high: 0, medium: 1, low: 2 }
  return out.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])
}

async function countTable(admin: SupabaseClient, table: string, opts?: { deletedNull?: boolean }): Promise<number> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic table
    let q = (admin as any).from(table).select('id', { count: 'exact', head: true })
    if (opts?.deletedNull) q = q.is('deleted_at', null)
    const { count, error } = await q
    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}

export async function buildOpsIntelligenceReport(
  admin: SupabaseClient,
  lookbackDays: number
): Promise<OpsIntelligenceReport> {
  const sinceIso = new Date(Date.now() - lookbackDays * 86_400_000).toISOString()

  const [ticketsAllActive, clients, projects, residentsCount, workersCount, professionalsCount, ticketLogsCount] =
    await Promise.all([
      fetchAllRows<TicketRow>((from, to) =>
        admin
          .from('tickets')
          .select(
            'id, client_id, project_id, status, created_at, closed_at, assigned_worker_id, reporter_phone, is_recurring, sla_alerted, escalated_at, source, source_channel, ticket_metadata'
          )
          .is('deleted_at', null)
          .range(from, to)
      ),
      fetchAllRows<ClientRow>((from, to) => admin.from('clients').select('id, name').range(from, to)),
      fetchAllRows<ProjectRow>((from, to) =>
        admin.from('projects').select('id, name, client_id, assigned_worker_id').range(from, to)
      ),
      countTable(admin, 'residents'),
      countTable(admin, 'workers'),
      countTable(admin, 'professionals'),
      countTable(admin, 'ticket_logs'),
    ])

  const ticketsInWindow = ticketsAllActive.filter((t) => t.created_at >= sinceIso)
  const windowIds = new Set(ticketsInWindow.map((t) => t.id))

  const logsAll = await fetchAllRows<LogRow>((from, to) =>
    admin
      .from('ticket_logs')
      .select('ticket_id, action_type, created_at, meta')
      .eq('action_type', 'ASSIGNED_TO_WORKER')
      .gte('created_at', sinceIso)
      .range(from, to)
  )
  const logs = logsAll.filter((l) => windowIds.has(l.ticket_id))

  return buildOpsIntelligenceFromStats({
    lookbackDays,
    ticketsAllActive,
    ticketsInWindow,
    logs,
    clients,
    projects,
    residentsCount,
    workersCount,
    professionalsCount,
    ticketLogsCount,
  })
}
