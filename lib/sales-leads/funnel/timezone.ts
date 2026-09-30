/**
 * Asia/Jerusalem calendar helpers for "today" / overdue.
 * Uses Intl so DST (IDT/IST) is handled by the TZ database.
 */

const JERUSALEM = 'Asia/Jerusalem'

function partsInJerusalem(date: Date): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: JERUSALEM,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const bag: Record<string, string> = {}
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') bag[p.type] = p.value
  }
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour: Number(bag.hour),
    minute: Number(bag.minute),
    second: Number(bag.second),
  }
}

/** Binary-search UTC instant whose Jerusalem wall-clock matches Y-M-D H:M:S. */
function jerusalemWallToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms = 0,
): Date {
  // Rough guess: Israel is UTC+2/+3
  let lo = Date.UTC(year, month - 1, day, hour - 5, minute, second, ms)
  let hi = Date.UTC(year, month - 1, day, hour + 5, minute, second, ms)
  for (let i = 0; i < 48; i++) {
    const mid = Math.floor((lo + hi) / 2)
    const p = partsInJerusalem(new Date(mid))
    const cmp =
      p.year !== year
        ? p.year - year
        : p.month !== month
          ? p.month - month
          : p.day !== day
            ? p.day - day
            : p.hour !== hour
              ? p.hour - hour
              : p.minute !== minute
                ? p.minute - minute
                : p.second - second
    if (cmp === 0) {
      const d = new Date(mid)
      d.setUTCMilliseconds(ms)
      // re-check after ms adjust
      return d
    }
    if (cmp < 0) lo = mid + 1
    else hi = mid - 1
  }
  return new Date(Math.floor((lo + hi) / 2))
}

export function jerusalemDayBounds(now = new Date()): {
  dayStart: Date
  dayEnd: Date
  dayStartIso: string
  dayEndIso: string
  ymd: string
} {
  const p = partsInJerusalem(now)
  const dayStart = jerusalemWallToUtc(p.year, p.month, p.day, 0, 0, 0, 0)
  const dayEnd = jerusalemWallToUtc(p.year, p.month, p.day, 23, 59, 59, 999)
  const ymd = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
  return {
    dayStart,
    dayEnd,
    dayStartIso: dayStart.toISOString(),
    dayEndIso: dayEnd.toISOString(),
    ymd,
  }
}

export function formatJerusalemDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('he-IL', {
    timeZone: JERUSALEM,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatJerusalemDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('he-IL', {
    timeZone: JERUSALEM,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Parse datetime-local / date input as Jerusalem wall time → UTC ISO. */
export function jerusalemInputToIso(localValue: string): string | null {
  const trimmed = localValue.trim()
  if (!trimmed) return null
  const m = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  )
  if (!m) {
    const d = new Date(trimmed)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const hour = m[4] != null ? Number(m[4]) : 12
  const minute = m[5] != null ? Number(m[5]) : 0
  const second = m[6] != null ? Number(m[6]) : 0
  return jerusalemWallToUtc(year, month, day, hour, minute, second, 0).toISOString()
}
