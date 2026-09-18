/**
 * Weekly Friday ops digest SMS for pilot managers (Sarah / Bamakor).
 * Plain Hebrew — no emoji (019SMS). Never auto-WhatsApp.
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

export function formatWeeklyOpsDigestSms(stats: WeeklyDigestStats): string {
  const name = stats.clientName.trim() || 'החברה'
  const lines: string[] = [`BINO - סיכום שבועי ל${name}`, '']

  if (stats.opened === 0 && stats.closed === 0) {
    lines.push('השבוע היה שקט יחסית: לא נפתחו ולא נסגרו תקלות חדשות.')
  } else {
    lines.push(`השבוע: נפתחו ${stats.opened}, נסגרו ${stats.closed}.`)
  }

  if (stats.openSlaRisk > 0) {
    lines.push(`פתוחות עכשיו: ${stats.openNow} (מתוכן ${stats.openSlaRisk} בסיכון SLA).`)
  } else {
    lines.push(`פתוחות עכשיו: ${stats.openNow} (אין סיכון SLA כרגע).`)
  }

  if (stats.recurringOpened > 0) {
    lines.push(`תקלות שסומנו כחוזרות השבוע: ${stats.recurringOpened}.`)
  }

  if (stats.focus) {
    const desc = stats.focus.description.trim() || '-'
    const short = desc.length > 70 ? `${desc.slice(0, 70)}…` : desc
    const slaBit = stats.focus.slaAlerted ? ' [SLA]' : ''
    lines.push('')
    lines.push(
      `נקודה למעקב: תקלה #${stats.focus.ticketNumber} ב${stats.focus.building || 'בניין'}${slaBit} - ${short}`
    )
  } else if (stats.openNow === 0) {
    lines.push('')
    lines.push('אין תקלות פתוחות כרגע — כל הכבוד.')
  }

  lines.push('')
  lines.push('BINO עקב אחרי השבוע בשבילך. שבת שלום.')
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
