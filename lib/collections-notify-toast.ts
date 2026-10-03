import { toast } from '@/lib/error-handler'

export type CollectionsToastKind = 'success' | 'warning' | 'error'

/** Outcome for create/send/resend when the API returns `sms_sent`. */
export function collectionsSmsToastMessage(opts: {
  smsSent: boolean | null | undefined
  successMessage: string
  smsFailedMessage: string
}): { type: 'success' | 'warning'; message: string } {
  if (opts.smsSent === true) {
    return { type: 'success', message: opts.successMessage }
  }
  return { type: 'warning', message: opts.smsFailedMessage }
}

/** Outcome for bulk send — never full success when `failed > 0`. */
export function collectionsBulkSendToastMessage(opts: {
  created: number
  sent: number
  failed: number
}): { type: CollectionsToastKind; message: string } {
  const created = Math.max(0, opts.created)
  const sent = Math.max(0, opts.sent)
  const failed = Math.max(0, opts.failed)
  const summary = `נוצרו ${created} · נשלחו ${sent} · נכשלו ${failed}`

  if (failed > 0) {
    if (sent > 0) {
      return { type: 'warning', message: `שליחה חלקית — ${summary}` }
    }
    return { type: 'error', message: `השליחה נכשלה — ${summary}` }
  }

  return { type: 'success', message: `השליחה המרוכזת הושלמה — ${summary}` }
}

export function toastCollectionsSmsOutcome(opts: {
  smsSent: boolean | null | undefined
  successMessage: string
  smsFailedMessage: string
}) {
  const outcome = collectionsSmsToastMessage(opts)
  if (outcome.type === 'success') toast.success(outcome.message)
  else toast.warning(outcome.message)
}

export function toastCollectionsBulkSendOutcome(opts: {
  created: number
  sent: number
  failed: number
}) {
  const outcome = collectionsBulkSendToastMessage(opts)
  if (outcome.type === 'success') toast.success(outcome.message)
  else if (outcome.type === 'warning') toast.warning(outcome.message)
  else toast.error(outcome.message)
}
