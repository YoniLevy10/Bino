/**
 * Shared resident-bot UI helpers (portal chat + sandbox).
 * Deterministic intents only — no invented AI backend.
 */

export type ResidentBotAction = {
  type: 'create_ticket' | 'midrag' | 'open_payments' | 'none'
  label: string
  href?: string
  payload?: {
    message?: string
    scope?: string
    confirmCreate?: boolean
  }
}

export const RESIDENT_BOT_QUICK_PROMPTS = [
  { label: 'פתיחת תקלה', message: 'יש תקלה במעלית' },
  { label: 'תשלומים', message: 'מה היתרה לתשלום?' },
  { label: 'הודעות', message: 'יש הודעות חדשות?' },
  { label: 'שעות מתקנים', message: 'מה שעות הבריכה והכושר היום?' },
  { label: 'סטטוס קריאה', message: 'מה סטטוס הקריאות שלי?' },
] as const

/** Actions that should render as tappable CTAs (href or confirm). */
export function residentBotVisibleActions(
  actions: ResidentBotAction[] | null | undefined
): ResidentBotAction[] {
  if (!actions?.length) return []
  return actions.filter((a) => {
    if (a.type === 'create_ticket' && a.payload) return true
    if (a.href && a.href.trim()) return true
    return false
  })
}

export function isExternalResidentHref(href: string): boolean {
  return href.startsWith('http://') || href.startsWith('https://')
}
