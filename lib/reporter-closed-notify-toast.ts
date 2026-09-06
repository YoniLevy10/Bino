import { toast } from '@/lib/error-handler'

export type ReporterClosedNotifyApiBody = {
  success?: boolean
  reporter_has_phone?: boolean
  whatsapp_sent?: boolean | null
  /** true when WhatsApp/SMS were scheduled after the HTTP response */
  notifications_queued?: boolean
}

/** Follow-up after close: WhatsApp to reporter only. */
export function toastReporterClosedNotifySummary(body: ReporterClosedNotifyApiBody) {
  // Allow callers that omit `success` when they already toast'd the close itself.
  if (body.success === false) return

  if (body.notifications_queued) {
    toast.info('התקלה נסגרה · שולחים הודעה לפותח התקלה…')
    return
  }

  const hasPhone = Boolean(body.reporter_has_phone)
  if (!hasPhone) {
    toast.info('לא רשום מספר לפותח התקלה — לא נשלחה הודעה')
    return
  }

  if (body.whatsapp_sent) {
    toast.success('נשלחה הודעת וואטסאפ לפותח התקלה')
  } else if (body.whatsapp_sent === false) {
    toast.warning('לא הצלחנו לשלוח הודעת וואטסאפ לפותח התקלה')
  }
}

export function toastReporterClosedNotifyNetworkWarning() {
  toast.warning('הפעולה נשמרה, אך לא ניתן היה לשלוח הודעה לפותח התקלה')
}
