/** Relative time label for Hebrew UI (e.g. "לפני 3 שע׳"). */
export function formatRelativeTimeHe(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''

  const diffMs = Date.now() - d.getTime()
  if (diffMs < 0) {
    return d.toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'עכשיו'
  if (mins < 60) return `לפני ${mins} דק׳`

  const hours = Math.floor(mins / 60)
  if (hours < 24) return `לפני ${hours} שע׳`

  const days = Math.floor(hours / 24)
  if (days < 7) return `לפני ${days} ימים`

  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })
}
