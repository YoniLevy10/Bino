/**
 * Weekly Friday ops digest SMS for pilot managers (Sarah / Bamakor).
 * Plain Hebrew — no emoji (019SMS). Never auto-WhatsApp.
 *
 * Formatting notes for Israeli SMS (RTL + Latin mix):
 * - Prefer Hebrew labels; keep Latin brand on its own line when needed
 * - Avoid "#", trailing "." after mixed runs, and ASCII "-" next to digits
 * - Short labeled lines survive iOS Messages better than long prose
 */

export type WeeklyDigestFocusTicket = {
  ticketNumber: number | string
  building: string
  description: string
  slaAlerted: boolean
}

export type WeeklyDigestStats = {
  clientName: string
  opened: number
  closed: number
  openNow: number
  openSlaRisk: number
  recurringOpened: number
  focus: WeeklyDigestFocusTicket | null
}

/** Strip chars that commonly flip RTL runs in SMS clients. */
function smsSafeDesc(raw: string): string {
  return raw
    .replace(/[\u200e\u200f\ufeff]/g, '')
    .replace(/[‐‑‒–—―]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function formatWeeklyOpsDigestSms(stats: WeeklyDigestStats): string {
  const name = smsSafeDesc(stats.clientName) || 'החברה'
  const lines: string[] = ['סיכום שבועי מבינו', `עבור ${name}`, '']

  if (stats.opened === 0 && stats.closed === 0) {
    lines.push('השבוע היה שקט: לא נפתחו ולא נסגרו תקלות.')
  } else {
    lines.push(`נפתחו השבוע: ${stats.opened}`)
    lines.push(`נסגרו השבוע: ${stats.closed}`)
  }

  lines.push(`פתוחות עכשיו: ${stats.openNow}`)
  if (stats.openSlaRisk > 0) {
    lines.push(`בסיכון לחריגת זמן: ${stats.openSlaRisk}`)
  } else {
    lines.push('בסיכון לחריגת זמן: אין')
  }

  if (stats.recurringOpened > 0) {
    lines.push(`תקלות חוזרות שנפתחו: ${stats.recurringOpened}`)
  }

  if (stats.focus) {
    const building = smsSafeDesc(stats.focus.building) || 'בניין'
    const desc = smsSafeDesc(stats.focus.description) || 'ללא תיאור'
    const short = desc.length > 60 ? `${desc.slice(0, 60)}…` : desc
    lines.push('')
    lines.push('נקודה למעקב:')
    lines.push(`תקלה ${stats.focus.ticketNumber} ב${building}`)
    if (stats.focus.slaAlerted) {
      lines.push('סטטוס: חריגת זמן')
    }
    lines.push(short)
  } else if (stats.openNow === 0) {
    lines.push('')
    lines.push('אין תקלות פתוחות כרגע. כל הכבוד.')
  }

  lines.push('')
  lines.push('בינו שמרה עליך השבוע')
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
