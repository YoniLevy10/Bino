/**
 * Outreach stop rules — never continue after reply / opt-out / demo / invalid.
 */
export type EnrollmentStopInput = {
  leadStatus: string
  optedOut: boolean
  markedInvalid: boolean
  replied: boolean
  demoBooked: boolean
  stopOnReply: boolean
  stopOnOptOut: boolean
  stopOnDemoBooked: boolean
}

export type StopDecision =
  | { stop: false }
  | { stop: true; status: 'stopped_reply' | 'stopped_opt_out' | 'stopped_demo' | 'stopped_invalid'; reason: string }

export function evaluateEnrollmentStop(input: EnrollmentStopInput): StopDecision {
  if (input.markedInvalid || input.leadStatus === 'disqualified' || input.leadStatus === 'suppressed') {
    return { stop: true, status: 'stopped_invalid', reason: 'ליד לא תקף / מדוכא' }
  }
  if (input.optedOut && input.stopOnOptOut) {
    return { stop: true, status: 'stopped_opt_out', reason: 'opt-out / suppression' }
  }
  if ((input.replied || input.leadStatus === 'replied') && input.stopOnReply) {
    return { stop: true, status: 'stopped_reply', reason: 'התקבלה תשובה' }
  }
  if (
    (input.demoBooked || input.leadStatus === 'demo_booked' || input.leadStatus === 'customer') &&
    input.stopOnDemoBooked
  ) {
    return { stop: true, status: 'stopped_demo', reason: 'נקבע דמו / לקוח' }
  }
  return { stop: false }
}
