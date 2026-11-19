/**
 * Weekly Friday ops digest SMS for pilot managers (Sarah / Bamakor).
 * Plain Hebrew — no emoji (019SMS). Never auto-WhatsApp.
 *
 * The numbers are the Israeli work week (Sunday 00:00 Asia/Jerusalem → now)
 * and the tickets still open right now. "Past handling time" is the ticket age
 * against the building SLA, not the sla_alerted flag: that flag is set only
 * after an SMS about an unassigned ticket, so an assigned ticket can be days
 * late while the flag stays false.
 *
 * Formatting notes for Israeli SMS (RTL + Latin mix):
 * - Client name (often Latin) stays on its own line
 * - Avoid "#", trailing "." after mixed runs, and ASCII "-" next to digits
 * - Skip a description that has no Hebrew (email subjects like "Dear Cora")
 */

export type WeeklyDigestFocusTicket = {
  ticketNumber: number | string
  building: string
  description: string
  openHours: number
  overdue: boolean
  unassigned: boolean
}

export type WeeklyDigestStats = {
  clientName: string
  opened: number
  closed: number
  openNow: number
  /** Open tickets whose age is already past the building SLA. */
  overdueNow: number
  recurringOpened: number
  focus: WeeklyDigestFocusTicket | null
}

export type DigestOpenTicket = {
  ticketNumber: number | string
  building: string
  description: string
  /** When the ticket started. Prefer opened_at, fall back to created_at. */
  startedAt: string
  slaHours: number | null
  assigned: boolean
}

const DEFAULT_SLA_HOURS = 24

/** Strip chars that commonly flip RTL runs in SMS clients. */
function smsSafeDesc(raw: string): string {
  return raw
    .replace(/[\u200e\u200f\ufeff]/g, '')
    .replace(/[‐‑‒–—―]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Resident text only. Latin email subjects are noise in a Hebrew SMS. */
function residentSnippet(raw: string): string {
  const clean = smsSafeDesc(raw)
  if (!/[\u0590-\u05FF]/.test(clean)) return ''
  return clean.length > 70 ? `${clean.slice(0, 70)}…` : clean
}

function tzParts(date: Date, timeZone: string): Record<string, string> {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const map: Record<string, string> = {}
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = part.value
  }
  if (map.hour === '24') map.hour = '00'
  return map
}

function tzOffsetMs(date: Date, timeZone: string): number {
  const p = tzParts(date, timeZone)
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second)
  )
  return asUtc - date.getTime()
}

/** Sunday 00:00 Asia/Jerusalem, as an ISO instant. Israeli work week. */
export function israelWeekStartIso(now = new Date()): string {
  const timeZone = 'Asia/Jerusalem'
  const p = tzParts(now, timeZone)
  const daysBack: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const back = daysBack[p.weekday] ?? 0
  const civilMidnightUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) - back)
  const offset = tzOffsetMs(new Date(civilMidnightUtc), timeZone)
  let instant = civilMidnightUtc - offset
  const offsetAtInstant = tzOffsetMs(new Date(instant), timeZone)
  if (offsetAtInstant !== offset) instant = civilMidnightUtc - offsetAtInstant
  return new Date(instant).toISOString()
}

export function openTicketAgeHours(startedAt: string, now: Date): number {
  const t = new Date(startedAt).getTime()
  if (!Number.isFinite(t)) return 0
  return Math.max(0, (now.getTime() - t) / 3_600_000)
}

export function effectiveSlaHours(slaHours: number | null): number {
  return typeof slaHours === 'number' && slaHours > 0 ? slaHours : DEFAULT_SLA_HOURS
}

function agePhrase(hours: number): string {
  const h = Math.max(0, Math.floor(hours))
  if (h < 1) return 'פתוחה פחות משעה'
  if (h === 1) return 'פתוחה שעה'
  return `פתוחה ${h} שעות`
}

function openedClosedLine(opened: number, closed: number): string {
  if (opened === 0 && closed === 0) return 'השבוע לא נפתחו ולא נסגרו תקלות.'
  if (opened === 0) {
    return closed === 1 ? 'לא נפתחה אף תקלה, ונסגרה אחת.' : `לא נפתחה אף תקלה, ונסגרו ${closed}.`
  }
  if (closed === 0) {
    return opened === 1 ? 'נפתחה תקלה אחת, ולא נסגרה אף תקלה.' : `נפתחו ${opened} תקלות, ולא נסגרה אף תקלה.`
  }
  if (opened === 1 && closed === 1) return 'נפתחה תקלה אחת ונסגרה אחת.'
  if (opened === 1) return `נפתחה תקלה אחת ונסגרו ${closed}.`
  if (closed === 1) return `נפתחו ${opened} תקלות ונסגרה אחת.`
  return `נפתחו ${opened} תקלות ונסגרו ${closed}.`
}

function openNowLine(openNow: number, overdueNow: number): string {
  if (openNow === 0) return 'אין תקלות פתוחות.'
  if (overdueNow <= 0) {
    return openNow === 1
      ? 'פתוחה תקלה אחת, בתוך זמן הטיפול.'
      : `פתוחות עכשיו ${openNow}, כולן בתוך זמן הטיפול.`
  }
  if (overdueNow >= openNow) {
    return openNow === 1
      ? 'פתוחה תקלה אחת, והיא עברה את זמן הטיפול.'
      : `פתוחות עכשיו ${openNow}, וכולן עברו את זמן הטיפול.`
  }
  const overduePart = overdueNow === 1 ? 'אחת עברה' : `${overdueNow} עברו`
  return `פתוחות עכשיו ${openNow}, מתוכן ${overduePart} את זמן הטיפול.`
}

function recurringLine(opened: number, recurringOpened: number): string | null {
  if (recurringOpened <= 0 || opened <= 0) return null
  if (recurringOpened >= opened) {
    return opened === 1
      ? 'התקלה שנפתחה היא חזרה על תקלה קודמת.'
      : `כל ${opened} התקלות שנפתחו הן חזרה על תקלה קודמת.`
  }
  return `${recurringOpened} מתוך ${opened} התקלות שנפתחו הן חזרה על תקלה קודמת.`
}

export function buildWeeklyDigestStats(input: {
  clientName: string
  opened: number
  closed: number
  recurringOpened: number
  openTickets: DigestOpenTicket[]
  now?: Date
}): WeeklyDigestStats {
  const now = input.now ?? new Date()
  const ranked = input.openTickets.map((ticket) => {
    const openHours = openTicketAgeHours(ticket.startedAt, now)
    const sla = effectiveSlaHours(ticket.slaHours)
    return {
      ticket,
      openHours,
      overdue: openHours >= sla,
      pastBy: openHours - sla,
    }
  })
  ranked.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
    if (b.pastBy !== a.pastBy) return b.pastBy - a.pastBy
    return a.ticket.startedAt.localeCompare(b.ticket.startedAt)
  })
  const top = ranked[0] ?? null
  const focus: WeeklyDigestFocusTicket | null = top
    ? {
        ticketNumber: top.ticket.ticketNumber,
        building: top.ticket.building,
        description: top.ticket.description,
        openHours: top.openHours,
        overdue: top.overdue,
        unassigned: !top.ticket.assigned,
      }
    : null

  return {
    clientName: input.clientName,
    opened: input.opened,
    closed: input.closed,
    openNow: input.openTickets.length,
    overdueNow: ranked.filter((row) => row.overdue).length,
    recurringOpened: Math.min(Math.max(0, input.recurringOpened), Math.max(0, input.opened)),
    focus,
  }
}

export function formatWeeklyOpsDigestSms(stats: WeeklyDigestStats): string {
  const name = smsSafeDesc(stats.clientName)
  const lines: string[] = []
  if (name) lines.push(name)
  lines.push('סיכום השבוע', '')
  lines.push(openedClosedLine(stats.opened, stats.closed))
  lines.push(openNowLine(stats.openNow, stats.overdueNow))

  if (stats.focus) {
    const building = smsSafeDesc(stats.focus.building)
    const where = building ? ` ב${building}` : ''
    const label = stats.focus.overdue ? 'הכי דחופה' : 'עדיין פתוחה'
    lines.push('')
    lines.push(`${label}: תקלה ${stats.focus.ticketNumber}${where}.`)
    const state = stats.focus.unassigned ? 'עדיין בלי שיוך' : 'משויכת'
    lines.push(`${state}, ${agePhrase(stats.focus.openHours)}.`)
    const snippet = residentSnippet(stats.focus.description)
    if (snippet) lines.push(snippet)
  }

  const recurring = recurringLine(stats.opened, stats.recurringOpened)
  if (recurring) {
    lines.push('')
    lines.push(recurring)
  }

  lines.push('')
  lines.push('שבת שלום')
  return lines.join('\n')
}

/** Bamakor (Sarah) — pilot client until Settings toggle exists. */
export const WEEKLY_DIGEST_PILOT_CLIENT_ID =
  process.env.WEEKLY_DIGEST_CLIENT_ID?.trim() || '7573f5ad-70e5-4357-8fef-1d96ec38d169'

/** Always CC Yoni / ops (comma-separated). */
export function weeklyDigestOpsPhones(): string[] {
  const raw =
    process.env.WEEKLY_DIGEST_OPS_PHONES?.trim() ||
    process.env.BINO_SALES_OPS_PHONE?.trim() ||
    '972548102688'
  return raw
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean)
}
