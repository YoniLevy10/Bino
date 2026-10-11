/** Shared Hebrew labels for per-building Grow connection (Settings + Collections). */

export type GrowProjectStatusTone = 'ok' | 'pending' | 'off'

export type GrowProjectStatusView = {
  tone: GrowProjectStatusTone
  /** Short status for list rows */
  label: string
  /** Full userId when connected; otherwise empty */
  userId: string | null
  /** Truncated userId for dense UI */
  userIdShort: string | null
  ready: boolean
}

export function growProjectStatusView(opts: {
  grow_enabled?: boolean | null
  grow_user_id?: string | null
  grow_onboarding_status?: string | null
  ready?: boolean
}): GrowProjectStatusView {
  const userId = (opts.grow_user_id || '').trim() || null
  const userIdShort = userId
    ? userId.length > 12
      ? `${userId.slice(0, 10)}…`
      : userId
    : null
  const ready =
    typeof opts.ready === 'boolean'
      ? opts.ready
      : opts.grow_enabled === true && Boolean(userId)

  if (ready && userId) {
    return { tone: 'ok', label: 'מחובר', userId, userIdShort, ready: true }
  }
  if (opts.grow_onboarding_status === 'pending') {
    return { tone: 'pending', label: 'ממתין לאישור', userId, userIdShort, ready: false }
  }
  if (opts.grow_onboarding_status === 'existing') {
    return { tone: 'pending', label: 'עסק קיים — הדביקו userId', userId, userIdShort, ready: false }
  }
  if (opts.grow_onboarding_status === 'rejected' || opts.grow_onboarding_status === 'error') {
    return { tone: 'off', label: 'הרשמה נכשלה', userId, userIdShort, ready: false }
  }
  if (userId && opts.grow_enabled !== true) {
    return { tone: 'pending', label: 'מזהה שמור — הפעילו', userId, userIdShort, ready: false }
  }
  return { tone: 'off', label: 'לא מחובר', userId: null, userIdShort: null, ready: false }
}

export const GROW_STATUS_TONE_COLOR: Record<GrowProjectStatusTone, string> = {
  ok: '#15803d',
  pending: '#c2410c',
  off: '#64748b',
}
