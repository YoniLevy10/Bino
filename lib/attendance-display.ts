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
