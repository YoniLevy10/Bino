/** Sales funnel stages, interest levels, tracking — separate concepts. */

export const LEAD_STAGES = [
  'new',
  'contact_attempt',
  'conversation_held',
  'demo_scheduled',
  'demo_done',
  'proposal_sent',
  'negotiation',
  'customer',
  'lost',
  'deferred',
] as const

export type LeadStage = (typeof LEAD_STAGES)[number]

/** Active pipeline (not closed outcomes). */
export const ACTIVE_LEAD_STAGES: readonly LeadStage[] = [
  'new',
  'contact_attempt',
  'conversation_held',
  'demo_scheduled',
  'demo_done',
  'proposal_sent',
  'negotiation',
]

export const OPEN_DEAL_STAGES: readonly LeadStage[] = [
  'new',
  'contact_attempt',
  'conversation_held',
  'demo_scheduled',
  'demo_done',
  'proposal_sent',
  'negotiation',
  'deferred',
]

export const INTEREST_LEVELS = [
  'unknown',
  'undecided',
  'interested',
  'not_interested',
] as const

export type InterestLevel = (typeof INTEREST_LEVELS)[number]

export const LOST_REASONS = [
  'no_budget',
  'chose_competitor',
  'no_need',
  'no_response',
  'timing',
  'do_not_contact',
  'other',
] as const

export type LostReason = (typeof LOST_REASONS)[number]

export const ACTIVITY_TYPES = [
  'note',
  'phone_attempt',
  'call',
  'whatsapp',
  'meeting',
  'demo',
  'proposal',
  'stage_change',
  'owner_change',
  'interest_change',
  'task_created',
  'task_done',
  'whatsapp_link_opened',
  'fields_update',
  'other',
] as const

export type ActivityType = (typeof ACTIVITY_TYPES)[number]

/** Contact-attempt outcomes — NOT interest levels. */
export const CONTACT_OUTCOMES = [
  'no_answer',
  'asked_callback',
  'conversation_held',
  'wrong_number',
  'sent',
  'other',
] as const

export type ContactOutcome = (typeof CONTACT_OUTCOMES)[number]

export type TrackingState =
  | 'no_action'
  | 'future'
  | 'due_today'
  | 'overdue'
  | 'closed'
  | 'waiting'

/** Legacy status values before funnel migration. */
export const LEGACY_LEAD_STATUSES = [
  'discovered',
  'qualified',
  'contacted',
  'demo_scheduled',
  'won',
  'lost',
  'rejected',
  'do_not_contact',
] as const

export type LegacyLeadStatus = (typeof LEGACY_LEAD_STATUSES)[number]

/**
 * Map pre-funnel status → stage.
 * Interest is NEVER inferred here.
 */
export function mapLegacyStatusToStage(status: string): LeadStage {
  switch (status) {
    case 'discovered':
    case 'qualified':
    case 'new':
      return 'new'
    case 'contacted':
    case 'contact_attempt':
      return 'contact_attempt'
    case 'conversation_held':
      return 'conversation_held'
    case 'demo_scheduled':
      return 'demo_scheduled'
    case 'demo_done':
      return 'demo_done'
    case 'proposal_sent':
      return 'proposal_sent'
    case 'negotiation':
      return 'negotiation'
    case 'won':
    case 'customer':
      return 'customer'
    case 'lost':
    case 'do_not_contact':
      return 'lost'
    case 'rejected':
    case 'deferred':
      return 'deferred'
    default:
      return 'new'
  }
}

export function isLeadStage(value: string): value is LeadStage {
  return (LEAD_STAGES as readonly string[]).includes(value)
}

export function isInterestLevel(value: string): value is InterestLevel {
  return (INTEREST_LEVELS as readonly string[]).includes(value)
}

export function stageLabelHe(stage: string): string {
  switch (stage) {
    case 'new':
      return 'חדש'
    case 'contact_attempt':
      return 'ניסיון יצירת קשר'
    case 'conversation_held':
      return 'שיחה התקיימה'
    case 'demo_scheduled':
      return 'דמו נקבע'
    case 'demo_done':
      return 'דמו בוצע'
    case 'proposal_sent':
      return 'הצעה נשלחה'
    case 'negotiation':
      return 'משא ומתן'
    case 'customer':
      return 'לקוח'
    case 'lost':
      return 'אבוד'
    case 'deferred':
      return 'נדחה להמשך'
    // legacy display fallbacks
    case 'discovered':
      return 'חדש'
    case 'qualified':
      return 'מסונן (ישן)'
    case 'contacted':
      return 'פנינו (ישן)'
    case 'won':
      return 'לקוח'
    case 'rejected':
      return 'נדחה'
    case 'do_not_contact':
      return 'לא ליצור קשר'
    default:
      return stage
  }
}

export function interestLabelHe(level: string): string {
  switch (level) {
    case 'unknown':
      return 'טרם ידוע'
    case 'undecided':
      return 'מתלבט'
    case 'interested':
      return 'מעוניין'
    case 'not_interested':
      return 'לא מעוניין'
    default:
      return level
  }
}

/** CSS-friendly tone token — UI must also show text. */
export function interestTone(level: string): 'gray' | 'yellow' | 'green' | 'red' {
  switch (level) {
    case 'undecided':
      return 'yellow'
    case 'interested':
      return 'green'
    case 'not_interested':
      return 'red'
    default:
      return 'gray'
  }
}

export function trackingLabelHe(state: TrackingState): string {
  switch (state) {
    case 'no_action':
      return 'ללא פעולה מתוכננת'
    case 'future':
      return 'טיפול עתידי'
    case 'due_today':
      return 'לטיפול היום'
    case 'overdue':
      return 'באיחור'
    case 'closed':
      return 'סגור'
    case 'waiting':
      return 'ממתין לתשובה'
    default:
      return state
  }
}

export function activityTypeLabelHe(type: string): string {
  switch (type) {
    case 'note':
      return 'הערה'
    case 'phone_attempt':
      return 'ניסיון טלפון'
    case 'call':
      return 'שיחה'
    case 'whatsapp':
      return 'WhatsApp'
    case 'meeting':
      return 'פגישה'
    case 'demo':
      return 'דמו'
    case 'proposal':
      return 'הצעה'
    case 'stage_change':
      return 'שינוי שלב'
    case 'owner_change':
      return 'החלפת אחראי'
    case 'interest_change':
      return 'שינוי עניין'
    case 'task_created':
      return 'משימה נוצרה'
    case 'task_done':
      return 'משימה הושלמה'
    case 'whatsapp_link_opened':
      return 'נפתח קישור WhatsApp'
    case 'fields_update':
      return 'עדכון שדות'
    default:
      return type
  }
}

export function contactOutcomeLabelHe(outcome: string): string {
  switch (outcome) {
    case 'no_answer':
      return 'לא ענה'
    case 'asked_callback':
      return 'ביקש לחזור'
    case 'conversation_held':
      return 'שיחה התקיימה'
    case 'wrong_number':
      return 'מספר שגוי'
    case 'sent':
      return 'נשלח'
    default:
      return outcome
  }
}

export function lostReasonLabelHe(reason: string): string {
  switch (reason) {
    case 'no_budget':
      return 'אין תקציב'
    case 'chose_competitor':
      return 'בחר מתחרה'
    case 'no_need':
      return 'אין צורך'
    case 'no_response':
      return 'אין מענה'
    case 'timing':
      return 'תזמון לא מתאים'
    case 'do_not_contact':
      return 'לא ליצור קשר'
    case 'other':
      return 'אחר'
    default:
      return reason
  }
}

/**
 * Derive tracking state from stage + next action + waiting flags.
 * Overdue is independent of interest (never paint interest red for lateness).
 */
export function deriveTrackingState(input: {
  stage: string
  nextActionAt: string | null | undefined
  waitingForReply?: boolean
  waitingUntil?: string | null
  now?: Date
  /** Jerusalem calendar day bounds as ISO instants */
  dayStartIso: string
  dayEndIso: string
}): TrackingState {
  if (input.stage === 'customer' || input.stage === 'lost') return 'closed'

  const now = input.now ?? new Date()
  const nowIso = now.toISOString()

  if (input.waitingForReply) {
    if (input.waitingUntil && input.waitingUntil < input.dayStartIso) {
      return 'overdue'
    }
    if (input.waitingUntil && input.waitingUntil <= input.dayEndIso && input.waitingUntil >= input.dayStartIso) {
      return 'due_today'
    }
    // Still waiting but check date may be future — show waiting; overdue handled above
    if (!input.nextActionAt) return 'waiting'
  }

  if (!input.nextActionAt) return 'no_action'
  if (input.nextActionAt < input.dayStartIso) return 'overdue'
  if (input.nextActionAt <= input.dayEndIso) return 'due_today'
  if (input.nextActionAt > nowIso) return 'future'
  return 'due_today'
}
