/** Israel calendar day bounds for "tasks today" filters (Asia/Jerusalem). */

export function getIsraelDayBounds(now = new Date()): { startIso: string; endIso: string; dayKey: string } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const dayKey = fmt.format(now) // YYYY-MM-DD
  // Build start/end as Jerusalem midnight via offset approximation using locale parts.
  const start = new Date(`${dayKey}T00:00:00+03:00`)
  // DST: Asia/Jerusalem is +02 or +03 — recompute with formatter on a mid-day UTC guess.
  const midGuess = new Date(`${dayKey}T12:00:00Z`)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jerusalem',
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(midGuess)
  const offsetPart = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT+3'
  const m = offsetPart.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/)
  const oh = m ? Number(m[1]) : 3
  const om = m && m[2] ? Number(m[2]) : 0
  const sign = oh >= 0 ? '+' : '-'
  const absH = String(Math.abs(oh)).padStart(2, '0')
  const absM = String(om).padStart(2, '0')
  const offset = `${sign}${absH}:${absM}`
  const startLocal = new Date(`${dayKey}T00:00:00${offset}`)
  const endLocal = new Date(`${dayKey}T23:59:59.999${offset}`)
  return {
    startIso: startLocal.toISOString(),
    endIso: endLocal.toISOString(),
    dayKey,
  }
}

/** Task belongs on today's board: due today, or open with no due date. */
export function isMaintenanceTaskForToday(opts: {
  dueAt: string | null | undefined
  status: string
  now?: Date
}): boolean {
  if (opts.status === 'DONE') return false
  if (!opts.dueAt) return true
  const { startIso, endIso } = getIsraelDayBounds(opts.now)
  const t = new Date(opts.dueAt).getTime()
  return t >= new Date(startIso).getTime() && t <= new Date(endIso).getTime()
}
