export const SHIFT_STATUS_HE: Record<string, string> = {
  open: 'בעבודה עכשיו',
  closed: 'הושלם',
  missing_checkout: 'חסרה יציאה',
  pending_review: 'ממתין לאישור',
  edited: 'עודכן ידנית',
}

export const EVENT_TYPE_HE: Record<string, string> = {
  clock_in: 'כניסה',
  clock_out: 'יציאה',
  project_visit: 'ביקור בבניין',
  project_arrival: 'הגעה',
  project_departure: 'יציאה מבניין',
}

export function formatShiftMinutes(totalMinutes: number | null | undefined): string {
  if (totalMinutes == null || !Number.isFinite(totalMinutes)) return '—'
  const m = Math.max(0, Math.round(totalMinutes))
  const h = Math.floor(m / 60)
  const min = m % 60
  if (h === 0) return `${min} דק׳`
  if (min === 0) return `${h} שעות`
  return `${h}:${String(min).padStart(2, '0')} שעות`
}

export function formatAttendanceDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('he-IL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatAttendanceDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function monthBounds(year: number, monthIndex: number): { from: string; to: string; label: string } {
  const from = new Date(year, monthIndex, 1, 0, 0, 0, 0)
  const to = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999)
  const label = from.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
  return { from: from.toISOString(), to: to.toISOString(), label }
}

/** `YYYY-MM` for a date (local calendar month). */
export function monthKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function currentMonthKey(d = new Date()): string {
  return monthKeyFromDate(d)
}

export function parseMonthKey(key: string): { year: number; monthIndex: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key.trim())
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (!Number.isFinite(year) || month < 1 || month > 12) return null
  return { year, monthIndex: month - 1 }
}

export function monthBoundsFromKey(key: string): { from: string; to: string; label: string } | null {
  const parsed = parseMonthKey(key)
  if (!parsed) return null
  return monthBounds(parsed.year, parsed.monthIndex)
}

/** Start of the current calendar month (local). */
export function startOfCurrentMonth(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0)
}

export function buildMonthOptions(count = 12, upTo = new Date()): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(upTo.getFullYear(), upTo.getMonth() - i, 1)
    const value = monthKeyFromDate(d)
    const label = d.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })
    opts.push({ value, label })
  }
  return opts
}

/** Past months only — excludes the current calendar month. */
export function buildPastMonthOptions(count = 24): { value: string; label: string }[] {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return buildMonthOptions(count, prev)
}

export function monthKeyFromIso(iso: string): string {
  return monthKeyFromDate(new Date(iso))
}

/** `datetime-local` input value in the user's local timezone. */
export function toDatetimeLocalValue(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Parse `datetime-local` string to ISO (local wall-clock → UTC). */
export function parseDatetimeLocalValue(value: string): string {
  return new Date(value).toISOString()
}

/** Decimal hours (e.g. 8.5) from shift minutes. */
export function minutesToDecimalHours(totalMinutes: number | null | undefined): string {
  if (totalMinutes == null || !Number.isFinite(totalMinutes)) return ''
  return (Math.max(0, totalMinutes) / 60).toFixed(2)
}

export function decimalHoursToMinutes(hours: string): number | null {
  const n = Number(hours.replace(',', '.').trim())
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 60)
}
