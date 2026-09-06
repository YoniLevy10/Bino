export type CalendarEventType = 'committee' | 'professional' | 'internal' | 'other'

export const CALENDAR_EVENT_TYPE_LABELS: Record<CalendarEventType, string> = {
  committee: 'ועד בית',
  professional: 'איש מקצוע',
  internal: 'פנימי',
  other: 'אחר',
}

export function monthRangeIso(year: number, month: number) {
  const from = new Date(year, month, 1)
  const to = new Date(year, month + 1, 1)
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    label: from.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' }),
  }
}

export function weekRangeIso(year: number, month: number, day: number) {
  const anchor = new Date(year, month, day)
  const start = new Date(anchor)
  start.setDate(anchor.getDate() - anchor.getDay())
  const end = new Date(start)
  end.setDate(start.getDate() + 7)
  return { from: start.toISOString(), to: end.toISOString() }
}

/** Sunday-start grid cells for month view (42 cells). */
export function buildMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1)
  const startOffset = first.getDay()
  const cells: { date: Date; inMonth: boolean }[] = []
  const gridStart = new Date(year, month, 1 - startOffset)
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    cells.push({ date: d, inMonth: d.getMonth() === month })
  }
  return cells
}

export function dateKeyLocal(d: Date): string {
  return d.toLocaleDateString('he-IL')
}

export function toLocalDatetimeInput(iso: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${iso.getFullYear()}-${p(iso.getMonth() + 1)}-${p(iso.getDate())}T${p(iso.getHours())}:${p(iso.getMinutes())}`
}

export function googleCalendarTemplateUrl(params: {
  title: string
  starts_at: string
  ends_at: string
  location?: string | null
  details?: string | null
}): string {
  const fmt = (iso: string) => {
    const d = new Date(iso)
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  }
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: params.title,
    dates: `${fmt(params.starts_at)}/${fmt(params.ends_at)}`,
  })
  if (params.location) q.set('location', params.location)
  if (params.details) q.set('details', params.details)
  return `https://calendar.google.com/calendar/render?${q.toString()}`
}

export function buildIcalCalendar(events: {
  id: string
  title: string
  description: string | null
  location: string | null
  starts_at: string
  ends_at: string
}[], calendarName: string): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bino//Office Calendar//HE',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${calendarName}`,
  ]
  for (const ev of events) {
    const uid = `${ev.id}@bino.app`
    const dt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    lines.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${dt(new Date().toISOString())}`)
    lines.push(`DTSTART:${dt(ev.starts_at)}`, `DTEND:${dt(ev.ends_at)}`, `SUMMARY:${escapeIcal(ev.title)}`)
    if (ev.location) lines.push(`LOCATION:${escapeIcal(ev.location)}`)
    if (ev.description) lines.push(`DESCRIPTION:${escapeIcal(ev.description)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

function escapeIcal(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}
