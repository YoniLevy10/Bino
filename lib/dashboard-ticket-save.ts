import { fetchWithTimeout, MUTATION_FETCH_TIMEOUT_MS } from '@/lib/fetch-with-timeout'

export type SaveDashboardTicketInput = {
  ticketId: string
  priority?: string
  status?: string
  previousStatus?: string
  description?: string
  draftWorkerId?: string
  previousWorkerId?: string | null
}

export type SaveDashboardTicketResult = {
  didAssign: boolean
  closedNow: boolean
  reporter_has_phone?: boolean
  whatsapp_sent?: boolean
}

/** שמירת תקלה מלוח הבקרה — שיוך עובד דרך API ייעודי, שאר השדות דרך update-ticket. */
export async function saveDashboardTicket(input: SaveDashboardTicketInput): Promise<SaveDashboardTicketResult> {
  const {
    ticketId,
    priority,
    status,
    description,
    draftWorkerId = '',
    previousWorkerId = null,
  } = input

  let didAssign = false
  const workerChanged = (previousWorkerId || '') !== (draftWorkerId || '')

  if (workerChanged && draftWorkerId) {
    const assignRes = await fetchWithTimeout(
      '/api/assign-ticket',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticketId, worker_id: draftWorkerId }),
      },
      MUTATION_FETCH_TIMEOUT_MS
    )
    const assignBody = (await assignRes?.json().catch(() => ({}))) as {
      error?: string
      worker_sms_sent?: boolean | null
      worker_sms_note?: string
    }
    if (!assignRes?.ok) throw new Error(assignBody.error || 'שיוך לעובד נכשל')
    if ((assignBody.worker_sms_sent === false || assignBody.worker_sms_sent === null) && assignBody.worker_sms_note) {
      const { toast } = await import('@/lib/error-handler')
      toast.error(assignBody.worker_sms_note)
    }
    didAssign = true
  }

  const updateBody: Record<string, unknown> = { ticket_id: ticketId }
  if (priority !== undefined) updateBody.priority = priority
  if (status !== undefined) updateBody.status = status
  if (description !== undefined) updateBody.description = description
  if (workerChanged && !draftWorkerId) {
    updateBody.assigned_worker_id = null
  } else if (!didAssign && draftWorkerId) {
    updateBody.assigned_worker_id = draftWorkerId
  }

  const updateRes = await fetchWithTimeout(
    '/api/update-ticket',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateBody),
    },
    MUTATION_FETCH_TIMEOUT_MS
  )
  const updateJson = (await updateRes?.json().catch(() => ({}))) as {
    error?: string
    closed_now?: boolean
    reporter_has_phone?: boolean
    whatsapp_sent?: boolean
  }
  if (!updateRes?.ok) {
    const errMsg =
      typeof updateJson.error === 'string'
        ? updateJson.error
        : updateJson.error && typeof updateJson.error === 'object'
          ? 'עדכון תקלה נכשל'
          : 'עדכון תקלה נכשל'
    throw new Error(errMsg)
  }

  const closedNow = status === 'CLOSED' && input.previousStatus !== 'CLOSED'
  return {
    didAssign,
    closedNow,
    reporter_has_phone: updateJson.reporter_has_phone,
    whatsapp_sent: updateJson.whatsapp_sent,
  }
}
