/**
 * Superadmin ops-intelligence report: north-star metrics from live ticket data,
 * derived learnings, and product improvement suggestions (BINO operational memory).
 *
 * This is descriptive analytics + heuristics — not a trained ML model.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows'
import {
  attentionScore,
  buildBriefing,
  buildFirstAssignMap,
  computeOpsSlice,
  hourlyRateMap,
  isClosedTicket,
  isMergedAway,
  summarizeWorkers,
  type OpsSlice,
  type OpsTicket,
  type OpsWorkerRef,
  type OpsWorkerRow,
} from '@/lib/ops-intelligence-slices'

export { avg, hoursBetween, median, pct, percentile, round1 } from '@/lib/ops-intelligence-slices'

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
    merged_excluded: number
  }
  portfolio: OpsSlice
  briefing: string
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
    client_id: string | null
    project_id: string
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
    attention_score: number
    slice: OpsSlice
  }[]
  projects: {
    project_id: string
    client_id: string | null
    name: string
    client_name: string
    has_default_worker: boolean
    attention_score: number
    slice: OpsSlice
  }[]
  workers: OpsWorkerRow[]
  workers_by_project: OpsWorkerRow[]
  monthly: { month: string; tickets: number; closed: number; recurring: number }[]
}

type TicketRow = OpsTicket

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
  /** Worker rows used for names and labor estimates. Defaults to none. */
  workerRefs?: OpsWorkerRef[]
  /** Freeze "now" for open-ticket aging. Defaults to the current time. */
  nowIso?: string
}

function bucketBy(list: TicketRow[], keyFn: (t: TicketRow) => string): Map<string, TicketRow[]> {
  const map = new Map<string, TicketRow[]>()
  for (const t of list) {
    const key = keyFn(t)
    const cur = map.get(key)
    if (cur) cur.push(t)
    else map.set(key, [t])
  }
  return map
}

function hasStructuredMetadata(t: TicketRow): boolean {
  if (t.ticket_metadata == null) return false
  if (typeof t.ticket_metadata === 'object' && !Array.isArray(t.ticket_metadata)) {
    return Object.keys(t.ticket_metadata as object).length > 0
  }
  return true
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
    workerRefs = [],
    nowIso,
  } = input

  const clientName = new Map(clients.map((c) => [c.id, (c.name ?? '').trim() || 'ללא שם']))
  const projectName = new Map(projects.map((p) => [p.id, (p.name ?? '').trim() || 'ללא שם']))
  const projectById = new Map(projects.map((p) => [p.id, p]))
  const nameOfClient = (id: string | null) => (id ? clientName.get(id) ?? 'ללא שם' : 'ללא לקוח')
  const nameOfProject = (id: string) => projectName.get(id) ?? 'ללא שם'

  const operationalAll = ticketsAllActive.filter((t) => !isMergedAway(t))
  const windowOps = ticketsInWindow.filter((t) => !isMergedAway(t))
  const mergedExcluded = ticketsInWindow.filter((t) => isMergedAway(t)).length
  const openNow = operationalAll.filter((t) => !isClosedTicket(t))
  const nowMs = Date.parse(nowIso ?? new Date().toISOString())
  const rates = hourlyRateMap(workerRefs)
  const assignByTicket = buildFirstAssignMap(logs, windowOps)

  const portfolio = computeOpsSlice({
    windowTickets: windowOps,
    openTickets: openNow,
    assignByTicket,
    hourlyRateByWorker: rates,
    nowMs,
    portfolioTickets: windowOps.length,
    portfolioMedianResolution: null,
  })

  const windowByClient = bucketBy(windowOps, (t) => t.client_id ?? '')
  const openByClient = bucketBy(openNow, (t) => t.client_id ?? '')
  const clientIds = new Set<string>([...windowByClient.keys(), ...openByClient.keys()])

  const clientsOut = [...clientIds]
    .filter((id) => id.length > 0)
    .map((id) => {
      const slice = computeOpsSlice({
        windowTickets: windowByClient.get(id) ?? [],
        openTickets: openByClient.get(id) ?? [],
        assignByTicket,
        hourlyRateByWorker: rates,
        nowMs,
        portfolioTickets: windowOps.length,
        portfolioMedianResolution: portfolio.median_hours_to_resolution,
      })
      return {
        client_id: id,
        name: nameOfClient(id),
        tickets: slice.tickets,
        closed: slice.closed,
        recurring: slice.recurring_count,
        assigned: slice.assigned,
        avg_hours_to_close: slice.avg_hours_to_resolution,
        sla_alerted: slice.sla_alerted_count,
        attention_score: attentionScore(slice),
        slice,
      }
    })
    .sort((a, b) => b.attention_score - a.attention_score || b.tickets - a.tickets)

  const windowByProject = bucketBy(windowOps, (t) => t.project_id)
  const openByProject = bucketBy(openNow, (t) => t.project_id)
  const projectIds = new Set<string>([...windowByProject.keys(), ...openByProject.keys()])

  const projectRows = [...projectIds].map((id) => {
    const meta = projectById.get(id)
    const list = windowByProject.get(id) ?? []
    const clientId = list[0]?.client_id ?? openByProject.get(id)?.[0]?.client_id ?? meta?.client_id ?? null
    const slice = computeOpsSlice({
      windowTickets: list,
      openTickets: openByProject.get(id) ?? [],
      assignByTicket,
      hourlyRateByWorker: rates,
      nowMs,
      portfolioTickets: windowOps.length,
      portfolioMedianResolution: portfolio.median_hours_to_resolution,
    })
    return {
      project_id: id,
      client_id: clientId,
      name: nameOfProject(id),
      client_name: nameOfClient(clientId),
      has_default_worker: Boolean(meta?.assigned_worker_id),
      attention_score: attentionScore(slice),
      slice,
    }
  }).sort((a, b) => b.attention_score - a.attention_score || b.slice.tickets - a.slice.tickets)

  const hot_buildings = [...projectRows]
    .sort((a, b) => b.slice.tickets - a.slice.tickets || b.slice.recurring_count - a.slice.recurring_count)
    .slice(0, 10)
    .map((p) => ({
      project_id: p.project_id,
      name: p.name,
      client_name: p.client_name,
      tickets: p.slice.tickets,
      recurring: p.slice.recurring_count,
      avg_hours_to_close: p.slice.avg_hours_to_resolution,
    }))

  const reporterKey = new Map<string, { phone: string; client_id: string | null; project_id: string; n: number }>()
  for (const t of windowOps) {
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
    .slice(0, 20)
    .map((r) => ({
      phone: r.phone,
      client_id: r.client_id,
      project_id: r.project_id,
      client_name: nameOfClient(r.client_id),
      project_name: nameOfProject(r.project_id),
      tickets: r.n,
    }))

  const workerNames = { clientName: nameOfClient, projectName: nameOfProject }
  const workerTables = summarizeWorkers(windowOps, workerRefs, workerNames)

  const windowN = windowOps.length
  const assignN = portfolio.assignment_sample_size
  const withMetadata = windowOps.filter(hasStructuredMetadata).length
  const buildingsWithDefaultWorker = projects.filter((p) => p.assigned_worker_id).length
  const by_source = portfolio.source_mix.map((s) => ({ source: s.key, count: s.count }))

  const first = ticketsAllActive.reduce<string | null>((min, t) => {
    if (!min || t.created_at < min) return t.created_at
    return min
  }, null)
  const last = ticketsAllActive.reduce<string | null>((max, t) => {
    if (!max || t.created_at > max) return t.created_at
    return max
  }, null)

  const north_star = {
    avg_hours_to_assignment: portfolio.avg_hours_to_assignment,
    median_hours_to_assignment: portfolio.median_hours_to_assignment,
    assignment_sample_size: assignN,
    assignment_coverage_pct: portfolio.assignment_rate_pct,
    auto_assign_pct: portfolio.auto_assign_pct,
    auto_assign_sample_size: portfolio.auto_assign_sample_size,
    avg_hours_to_resolution: portfolio.avg_hours_to_resolution,
    median_hours_to_resolution: portfolio.median_hours_to_resolution,
    resolution_sample_size: portfolio.resolution_sample_size,
    recurring_rate_pct: portfolio.recurring_rate_pct,
    recurring_count: portfolio.recurring_count,
    sla_alert_rate_pct: portfolio.sla_alert_rate_pct,
    sla_alerted_count: portfolio.sla_alerted_count,
    escalation_rate_pct: portfolio.escalation_rate_pct,
    escalated_count: portfolio.escalated_count,
    maintenance_cost_available: portfolio.labor_cost_estimate != null,
    without_manager_proxy_pct: portfolio.auto_assign_pct,
  }

  const laborDetail =
    portfolio.labor_cost_estimate == null
      ? 'אין תעריף שעתי על עובדים שסגרו תקלות — עלות תחזוקה לא ניתנת לאמידה'
      : `אומדן עלות עבודה ${portfolio.labor_cost_estimate.toLocaleString('he-IL')} ₪ על ${portfolio.labor_priced_closed}/${portfolio.labor_closed} סגירות עם תעריף. זה שעות עד סגירה כפול תעריף, לא חשבונית ספק.`

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
      status: assignN >= 20 ? 'ok' : assignN > 0 ? 'thin' : 'missing',
      detail:
        assignN > 0
          ? `חציון לפי השיוך הראשון בלוג, ${assignN} תקלות (שיוך חוזר לא נספר שוב)`
          : 'אין אירועי שיוך בלוג בחלון — לא ניתן לחשב זמן עד שיוך',
    },
    {
      key: 'cost',
      label: 'עלות תחזוקה לבניין',
      status: portfolio.labor_cost_estimate == null ? 'missing' : 'thin',
      detail: laborDetail,
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
    tickets_active: operationalAll.length,
    tickets_in_window: windowN,
    tickets_closed_in_window: portfolio.closed,
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
    merged_excluded: mergedExcluded,
  }

  const monthly = portfolio.monthly.map((m) => ({
    month: m.month,
    tickets: m.opened,
    closed: m.closed,
    recurring: m.recurring,
  }))

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
    portfolio,
    briefing: buildBriefing(portfolio, lookbackDays, 'בכל המערכת'),
    north_star,
    learnings,
    suggestions,
    hot_buildings,
    repeat_reporters,
    clients: clientsOut,
    projects: projectRows,
    workers: workerTables.byClient,
    workers_by_project: workerTables.byProject,
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

  const [ticketsAllActive, clients, projects, residentsCount, workerRefs, professionalsCount, ticketLogsCount] =
    await Promise.all([
      fetchAllRows<TicketRow>((from, to) =>
        admin
          .from('tickets')
          .select(
            'id, client_id, project_id, status, created_at, opened_at, closed_at, assigned_worker_id, reporter_phone, is_recurring, sla_alerted, escalated_at, source, source_channel, ticket_metadata, priority, is_merged'
          )
          .is('deleted_at', null)
          .range(from, to)
      ),
      fetchAllRows<ClientRow>((from, to) => admin.from('clients').select('id, name').range(from, to)),
      fetchAllRows<ProjectRow>((from, to) =>
        admin.from('projects').select('id, name, client_id, assigned_worker_id').range(from, to)
      ),
      countTable(admin, 'residents'),
      fetchAllRows<OpsWorkerRef>((from, to) =>
        admin.from('workers').select('id, full_name, client_id, hourly_rate').is('deleted_at', null).range(from, to)
      ),
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
    workersCount: workerRefs.length,
    professionalsCount,
    ticketLogsCount,
    workerRefs,
  })
}
