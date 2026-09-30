/** Calendar helpers in Asia/Jerusalem for amenity hours / announcement expiry. */

const TZ = 'Asia/Jerusalem'

export function jerusalemTodayParts(now = new Date()): {
  dateStr: string
  dayOfWeek: number
  timeStr: string
} {
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)

  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
  }).format(now)
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  const dayOfWeek = map[weekday] ?? 0

  const timeStr = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now)

  return { dateStr, dayOfWeek, timeStr }
}

export function isAnnouncementVisibleNow(opts: {
  status: string
  publish_at: string | null
  published_at: string | null
  expires_at: string | null
  now?: Date
}): boolean {
  if (opts.status !== 'published') return false
  const now = opts.now ?? new Date()
  const publishAt = opts.publish_at || opts.published_at
  if (publishAt && new Date(publishAt).getTime() > now.getTime()) return false
  if (opts.expires_at && new Date(opts.expires_at).getTime() <= now.getTime()) return false
  return true
}
