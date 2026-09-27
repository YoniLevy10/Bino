import { ticketStatusLabelHe, TICKET_STATUSES_IN_TREATMENT } from '@/lib/ticket-status'

export type OpsBreakdown = { key: string; label: string; count: number; pct: number }

export type OpsAging = {
  under_24h: number
  d1_3: number
  d3_7: number
  d7_30: number
  over_30d: number
}

export type OpsMonthPoint = { month: string; opened: number; closed: number; recurring: number }

/** One comparable cut of the ticket population (portfolio, client, or project). */
export type OpsSlice = {
  tickets: number
  closed: number
  /** Cohort tickets from the window that are still open. */
  cohort_open: number
  /** Current open backlog in this scope, including tickets opened before the window. */
  open_now: number
  assigned: number
  unassigned_open: number
  in_treatment: number
  close_rate_pct: number
  assignment_rate_pct: number
  recurring_count: number
  recurring_rate_pct: number
  sla_alerted_count: number
  sla_alert_rate_pct: number
  escalated_count: number
  escalation_rate_pct: number
  auto_assign_pct: number | null
  auto_assign_sample_size: number
  avg_hours_to_assignment: number | null
  median_hours_to_assignment: number | null
  p90_hours_to_assignment: number | null
  assignment_sample_size: number
  avg_hours_to_resolution: number | null
  median_hours_to_resolution: number | null
  p90_hours_to_resolution: number | null
  resolution_sample_size: number
  /** This slice's median resolution minus the portfolio median. Negative = faster. */
  resolution_vs_portfolio_hours: number | null
  share_of_portfolio_pct: number
  open_aging: OpsAging
  status_mix: OpsBreakdown[]
  priority_mix: OpsBreakdown[]
  source_mix: OpsBreakdown[]
  monthly: OpsMonthPoint[]
  /** Hours-to-close × worker hourly rate. Null when no priced closures. */
  labor_cost_estimate: number | null
  labor_priced_closed: number
  labor_closed: number
}

export type OpsTicket = {
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
  ticket_metadata?: unknown
  priority?: string | null
  opened_at?: string | null
  is_merged?: boolean | null
}

export type OpsAssignEvent = { hours: number; auto: boolean }

export type OpsWorkerRef = {
  id: string
  full_name: string
  client_id: string
  hourly_rate: number | null
}

export type OpsWorkerRow = {
  worker_id: string
  name: string
  client_id: string | null
  client_name: string
  /** Null when the row rolls up every project for this worker. */
  project_id: string | null
  project_name: string | null
  tickets: number
  closed: number
  close_rate_pct: number
  median_hours_to_resolution: number | null
  recurring: number
  labor_cost_estimate: number | null
  labor_priced_tickets: number
}

const PRIORITY_HE: Record<string, string> = {
  URGENT: 'דחופה',
  HIGH: 'גבוהה',
  MEDIUM: 'בינונית',
  LOW: 'נמוכה',
}

const PRIORITY_ORDER = ['URGENT', 'HIGH', 'MEDIUM', 'LOW']

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
  if (sorted.length % 2 === 0) return (sorted[mid - 1]! + sorted[mid]!) / 2
  return sorted[mid]!
}

export function avg(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((s, v) => s + v, 0) / values.length
}

/** Linear-interpolated percentile. p is 0–100. */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 1) return sorted[0]!
  const rank = (Math.min(100, Math.max(0, p)) / 100) * (sorted.length - 1)
  const lo = Math.floor(rank)
  const hi = Math.ceil(rank)
  if (lo === hi) return sorted[lo]!
  const w = rank - lo
  return sorted[lo]! * (1 - w) + sorted[hi]! * w
}

export function round1(n: number | null): number | null {
  if (n == null || !Number.isFinite(n)) return null
  return Math.round(n * 10) / 10
}

export function round0(n: number | null): number | null {
  if (n == null || !Number.isFinite(n)) return null
  return Math.round(n)
}

export function pct(part: number, whole: number): number {
  if (whole <= 0) return 0
  return Math.round((part / whole) * 1000) / 10
}

export function isMergedAway(t: OpsTicket): boolean {
  return t.is_merged === true
}

export function ticketStart(t: OpsTicket): string {
  if (t.opened_at && Number.isFinite(Date.parse(t.opened_at))) return t.opened_at
  return t.created_at
}

export function isClosedTicket(t: OpsTicket): boolean {
  return t.status === 'CLOSED' || Boolean(t.closed_at)
}

export function emptyAging(): OpsAging {
  return { under_24h: 0, d1_3: 0, d3_7: 0, d7_30: 0, over_30d: 0 }
}

export function emptySlice(): OpsSlice {
  return {
    tickets: 0,
    closed: 0,
    cohort_open: 0,
    open_now: 0,
    assigned: 0,
    unassigned_open: 0,
    in_treatment: 0,
    close_rate_pct: 0,
    assignment_rate_pct: 0,
    recurring_count: 0,
    recurring_rate_pct: 0,
    sla_alerted_count: 0,
    sla_alert_rate_pct: 0,
    escalated_count: 0,
    escalation_rate_pct: 0,
    auto_assign_pct: null,
    auto_assign_sample_size: 0,
    avg_hours_to_assignment: null,
    median_hours_to_assignment: null,
    p90_hours_to_assignment: null,
    assignment_sample_size: 0,
    avg_hours_to_resolution: null,
    median_hours_to_resolution: null,
    p90_hours_to_resolution: null,
    resolution_sample_size: 0,
    resolution_vs_portfolio_hours: null,
    share_of_portfolio_pct: 0,
    open_aging: emptyAging(),
    status_mix: [],
    priority_mix: [],
    source_mix: [],
    monthly: [],
    labor_cost_estimate: null,
    labor_priced_closed: 0,
    labor_closed: 0,
  }
}

function sourceOf(t: OpsTicket): string {
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

function agingKey(hours: number): keyof OpsAging {
  if (hours < 24) return 'under_24h'
  if (hours < 72) return 'd1_3'
  if (hours < 168) return 'd3_7'
  if (hours < 720) return 'd7_30'
  return 'over_30d'
}

function breakdown(
  counts: Map<string, number>,
  labelOf: (key: string) => string,
  order: string[] = []
): OpsBreakdown[] {
  const total = [...counts.values()].reduce((s, n) => s + n, 0)
  const seen = new Set<string>()
  const keys: string[] = []
  for (const key of order) {
    if ((counts.get(key) ?? 0) > 0) {
      keys.push(key)
      seen.add(key)
    }
  }
  const rest = [...counts.keys()].filter((k) => !seen.has(k) && (counts.get(k) ?? 0) > 0)
  rest.sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
  keys.push(...rest)
  return keys.map((key) => ({
    key,
    label: labelOf(key),
    count: counts.get(key) ?? 0,
    pct: pct(counts.get(key) ?? 0, total),
  }))
}

export function attentionScore(slice: OpsSlice): number {
  return (
    slice.unassigned_open * 4 +
    slice.open_aging.over_30d * 3 +
    slice.open_aging.d7_30 * 2 +
    slice.recurring_count +
    slice.sla_alerted_count
  )
}

export function formatHoursHe(hours: number | null | undefined): string {
  if (hours == null || !Number.isFinite(hours)) return '—'
  if (hours < 1) return `${Math.round(hours * 60).toLocaleString('he-IL')} דק׳`
  if (hours < 48) {
    const rounded = Math.round(hours * 10) / 10
    return `${rounded.toLocaleString('he-IL')} שע׳`
  }
  const days = Math.round((hours / 24) * 10) / 10
  return `${days.toLocaleString('he-IL')} ימים`
}

export function formatIls(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return '—'
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function buildBriefing(slice: OpsSlice, lookbackDays: number, scopeLabel: string): string {
  if (slice.tickets === 0 && slice.open_now === 0) {
    return `${scopeLabel}: אין תקלות ב-${lookbackDays} הימים האחרונים ואין תקלות פתוחות.`
  }
  const opened =
    slice.tickets === 0
      ? `לא נפתחו תקלות ב-${lookbackDays} הימים האחרונים`
      : `נפתחו ${slice.tickets.toLocaleString('he-IL')} תקלות ב-${lookbackDays} הימים האחרונים, נסגרו ${slice.closed.toLocaleString('he-IL')} (${slice.close_rate_pct.toLocaleString('he-IL')}%)`
  const assign =
    slice.assignment_sample_size > 0
      ? `חציון עד שיוך ${formatHoursHe(slice.median_hours_to_assignment)} (n=${slice.assignment_sample_size})`
      : 'אין מדידת זמן עד שיוך'
  const resolve =
    slice.resolution_sample_size > 0
      ? `חציון עד פתרון ${formatHoursHe(slice.median_hours_to_resolution)} (n=${slice.resolution_sample_size})`
      : 'אין סגירות עם חותמת זמן'
  const recurring = `${slice.recurring_rate_pct.toLocaleString('he-IL')}% סומנו כחוזרות`
  const stock = `עכשיו ${slice.open_now.toLocaleString('he-IL')} פתוחות, מתוכן ${slice.unassigned_open.toLocaleString('he-IL')} בלי שיוך ו-${(slice.open_aging.d7_30 + slice.open_aging.over_30d).toLocaleString('he-IL')} מעל 7 ימים`
  return `${scopeLabel}: ${opened}. ${assign}. ${resolve}. ${recurring}. ${stock}.`
}

export function computeOpsSlice(args: {
  windowTickets: OpsTicket[]
  openTickets: OpsTicket[]
  assignByTicket: Map<string, OpsAssignEvent>
  hourlyRateByWorker: Map<string, number>
  nowMs: number
  portfolioTickets: number
  portfolioMedianResolution: number | null
}): OpsSlice {
  const { windowTickets, openTickets, assignByTicket, hourlyRateByWorker, nowMs } = args
  const base = emptySlice()
  const n = windowTickets.length

  const assignHours: number[] = []
  let autoAssign = 0
  for (const t of windowTickets) {
    const ev = assignByTicket.get(t.id)
    if (!ev) continue
    assignHours.push(ev.hours)
    if (ev.auto) autoAssign += 1
  }

  const resolutionHours: number[] = []
  let labor = 0
  let laborPriced = 0
  let laborClosed = 0
  let closed = 0
  let assigned = 0
  let inTreatment = 0
  let recurring = 0
  let sla = 0
  let escalated = 0
  const statusCounts = new Map<string, number>()
  const priorityCounts = new Map<string, number>()
  const sourceCounts = new Map<string, number>()
  const monthMap = new Map<string, OpsMonthPoint>()

  for (const t of windowTickets) {
    const closedTicket = isClosedTicket(t)
    if (closedTicket) closed += 1
    if (t.assigned_worker_id) assigned += 1
    if ((TICKET_STATUSES_IN_TREATMENT as readonly string[]).includes(t.status)) inTreatment += 1
    if (t.is_recurring === true) recurring += 1
    if (t.sla_alerted === true) sla += 1
    if (t.escalated_at != null) escalated += 1

    statusCounts.set(t.status || 'UNKNOWN', (statusCounts.get(t.status || 'UNKNOWN') ?? 0) + 1)
    const pr = (t.priority ?? '').trim().toUpperCase() || 'UNSPECIFIED'
    priorityCounts.set(pr, (priorityCounts.get(pr) ?? 0) + 1)
    const src = sourceOf(t)
    sourceCounts.set(src, (sourceCounts.get(src) ?? 0) + 1)

    const m = monthKey(ticketStart(t))
    const point = monthMap.get(m) ?? { month: m, opened: 0, closed: 0, recurring: 0 }
    point.opened += 1
    if (closedTicket) point.closed += 1
    if (t.is_recurring) point.recurring += 1
    monthMap.set(m, point)

    if (!t.closed_at) continue
    const h = hoursBetween(ticketStart(t), t.closed_at)
    if (h == null) continue
    resolutionHours.push(h)
    laborClosed += 1
    const rate = t.assigned_worker_id ? hourlyRateByWorker.get(t.assigned_worker_id) : undefined
    if (rate != null && rate > 0) {
      labor += h * rate
      laborPriced += 1
    }
  }

  const aging = emptyAging()
  let unassignedOpen = 0
  for (const t of openTickets) {
    if (t.assigned_worker_id == null) unassignedOpen += 1
    const h = hoursBetween(ticketStart(t), new Date(nowMs).toISOString())
    if (h == null) continue
    aging[agingKey(h)] += 1
  }

  const medianResolution = round1(median(resolutionHours))
  const vs =
    medianResolution != null && args.portfolioMedianResolution != null
      ? round1(medianResolution - args.portfolioMedianResolution)
      : null

  return {
    tickets: n,
    closed,
    cohort_open: n - closed,
    open_now: openTickets.length,
    assigned,
    unassigned_open: unassignedOpen,
    in_treatment: inTreatment,
    close_rate_pct: pct(closed, n),
    assignment_rate_pct: pct(assigned, n),
    recurring_count: recurring,
    recurring_rate_pct: pct(recurring, n),
    sla_alerted_count: sla,
    sla_alert_rate_pct: pct(sla, n),
    escalated_count: escalated,
    escalation_rate_pct: pct(escalated, n),
    auto_assign_pct: assignHours.length > 0 ? pct(autoAssign, assignHours.length) : null,
    auto_assign_sample_size: assignHours.length,
    avg_hours_to_assignment: round1(avg(assignHours)),
    median_hours_to_assignment: round1(median(assignHours)),
    p90_hours_to_assignment: round1(percentile(assignHours, 90)),
    assignment_sample_size: assignHours.length,
    avg_hours_to_resolution: round1(avg(resolutionHours)),
    median_hours_to_resolution: medianResolution,
    p90_hours_to_resolution: round1(percentile(resolutionHours, 90)),
    resolution_sample_size: resolutionHours.length,
    resolution_vs_portfolio_hours: vs,
    share_of_portfolio_pct: pct(n, args.portfolioTickets),
    open_aging: aging,
    status_mix: breakdown(statusCounts, (k) => ticketStatusLabelHe(k)),
    priority_mix: breakdown(priorityCounts, (k) => PRIORITY_HE[k] ?? (k === 'UNSPECIFIED' ? 'לא סווגה' : k), PRIORITY_ORDER),
    source_mix: breakdown(sourceCounts, (k) => (k === 'unknown' ? 'לא ידוע' : k)),
    monthly: [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
    labor_cost_estimate: laborPriced > 0 ? round0(labor) : null,
    labor_priced_closed: laborPriced,
    labor_closed: laborClosed,
  }
}

type LogLike = { ticket_id: string; action_type: string | null; created_at: string; meta: unknown }

function isAutoFromProjectMeta(meta: unknown): boolean {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return false
  return (meta as { auto_from_project?: unknown }).auto_from_project === true
}

/** Earliest ASSIGNED_TO_WORKER log per ticket. Later reassignments do not stretch time-to-assign. */
export function buildFirstAssignMap(logs: LogLike[], tickets: OpsTicket[]): Map<string, OpsAssignEvent> {
  const startById = new Map(tickets.map((t) => [t.id, ticketStart(t)]))
  const earliest = new Map<string, LogLike>()
  for (const log of logs) {
    if (log.action_type !== 'ASSIGNED_TO_WORKER') continue
    const prev = earliest.get(log.ticket_id)
    if (!prev || log.created_at < prev.created_at) earliest.set(log.ticket_id, log)
  }
  const out = new Map<string, OpsAssignEvent>()
  for (const [id, log] of earliest) {
    const start = startById.get(id)
    if (!start) continue
    const h = hoursBetween(start, log.created_at)
    if (h == null) continue
    out.set(id, { hours: h, auto: isAutoFromProjectMeta(log.meta) })
  }
  return out
}

export function hourlyRateMap(workers: OpsWorkerRef[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const w of workers) {
    if (w.hourly_rate != null && w.hourly_rate > 0) map.set(w.id, w.hourly_rate)
  }
  return map
}

function workerBucket(
  tickets: OpsTicket[],
  workers: OpsWorkerRef[],
  names: { clientName: (id: string | null) => string; projectName: (id: string) => string },
  mode: 'client' | 'project'
): OpsWorkerRow[] {
  const byId = new Map(workers.map((w) => [w.id, w]))
  const groups = new Map<string, OpsTicket[]>()
  for (const t of tickets) {
    if (!t.assigned_worker_id) continue
    const key = mode === 'project' ? `${t.assigned_worker_id}|${t.project_id}` : t.assigned_worker_id
    const list = groups.get(key) ?? []
    list.push(t)
    groups.set(key, list)
  }

  const rows: OpsWorkerRow[] = []
  for (const list of groups.values()) {
    const sample = list[0]!
    const worker = sample.assigned_worker_id ? byId.get(sample.assigned_worker_id) : undefined
    const hours: number[] = []
    let closed = 0
    let recurring = 0
    let labor = 0
    let priced = 0
    const rate = worker?.hourly_rate != null && worker.hourly_rate > 0 ? worker.hourly_rate : null
    for (const t of list) {
      if (t.is_recurring) recurring += 1
      if (!isClosedTicket(t) || !t.closed_at) continue
      closed += 1
      const h = hoursBetween(ticketStart(t), t.closed_at)
      if (h == null) continue
      hours.push(h)
      if (rate != null) {
        labor += h * rate
        priced += 1
      }
    }
    const clientId = worker?.client_id ?? sample.client_id
    rows.push({
      worker_id: sample.assigned_worker_id!,
      name: (worker?.full_name ?? '').trim() || 'עובד לא מזוהה',
      client_id: clientId,
      client_name: names.clientName(clientId),
      project_id: mode === 'project' ? sample.project_id : null,
      project_name: mode === 'project' ? names.projectName(sample.project_id) : null,
      tickets: list.length,
      closed,
      close_rate_pct: pct(closed, list.length),
      median_hours_to_resolution: round1(median(hours)),
      recurring,
      labor_cost_estimate: priced > 0 ? round0(labor) : null,
      labor_priced_tickets: priced,
    })
  }

  return rows.sort((a, b) => b.tickets - a.tickets || a.name.localeCompare(b.name, 'he'))
}

export function summarizeWorkers(
  tickets: OpsTicket[],
  workers: OpsWorkerRef[],
  names: { clientName: (id: string | null) => string; projectName: (id: string) => string }
): { byClient: OpsWorkerRow[]; byProject: OpsWorkerRow[] } {
  return {
    byClient: workerBucket(tickets, workers, names, 'client'),
    byProject: workerBucket(tickets, workers, names, 'project'),
  }
}
