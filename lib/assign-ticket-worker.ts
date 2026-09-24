import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWorkerSMSAll, type WorkerSmsBatchResult } from '@/lib/sms-send'
import { collectWorkerPhones } from '@/lib/worker-phones'
import { getWorkerPortalUrl } from '@/lib/public-app-url'
import { notifyWorkerAssignedPush } from '@/lib/push-notifications'
import { getLogger } from '@/lib/logging'
import { notifyWorkerAssignmentWhatsApp, type WorkerAssignmentWaResult } from '@/lib/worker-assignment-wa-notify'
import { runAfterResponse, shouldSyncTicketNotifications } from '@/lib/run-after-response'

export type AssignTicketToWorkerResult = {
  ok: boolean
  updatedTicket?: Record<string, unknown>
  workerSms: WorkerSmsBatchResult | null
  workerSmsNote?: string
  workerWhatsApp?: WorkerAssignmentWaResult | null
  workerWhatsAppNote?: string
  /** true when SMS/WA/push were scheduled after the response */
  notificationsQueued?: boolean
  error?: string
}

type WorkerRow = {
  id: string
  full_name: string
  phone?: string | null
  extra_phones?: string[] | null
  access_token?: string | null
  notify_sms?: boolean | null
  notify_whatsapp?: boolean | null
  notify_push?: boolean | null
}

/**
 * Assigns a ticket to a worker: DB update, log, SMS (all phones), push — same as manual /api/assign-ticket.
 */

async function sendAssignTicketNotifications(opts: {
  supabase: SupabaseClient
  logger: ReturnType<typeof getLogger>
  worker: WorkerRow
  workerId: string
  clientId: string
  ticketId: string
  ticketNumber: number
  description: string | null
  buildingName: string
  smsSenderName?: string | null
}): Promise<{
  workerSms: WorkerSmsBatchResult | null
  workerSmsNote?: string
  workerWhatsApp: WorkerAssignmentWaResult | null
  workerWhatsAppNote?: string
}> {
  const {
    supabase,
    logger,
    worker: w,
    workerId,
    clientId,
    ticketId,
    ticketNumber,
    description,
    buildingName,
    smsSenderName,
  } = opts

  let workerSms: WorkerSmsBatchResult | null = null
  let workerSmsNote: string | undefined
  let workerWhatsApp: WorkerAssignmentWaResult | null = null
  let workerWhatsAppNote: string | undefined

  const workerPhones = collectWorkerPhones(w)

  if (workerPhones.length === 0) {
    workerSmsNote = 'לעובד אין מספר טלפון במערכת — לא נשלח SMS.'
    return { workerSms, workerSmsNote, workerWhatsApp, workerWhatsAppNote }
  }

  const wantSms = w.notify_sms !== false
  const wantWa = w.notify_whatsapp !== false
  const wantPush = w.notify_push !== false

  const workerToken = w.access_token?.trim()
  const portalUrl = workerToken ? getWorkerPortalUrl(workerToken) : null
  const smsMessage = portalUrl
    ? `שויכת לתקלה #${ticketNumber} ב${buildingName}: ${description || 'ללא תיאור'}. האזור האישי: ${portalUrl}`
    : `שויכת לתקלה #${ticketNumber} ב${buildingName}: ${description || 'ללא תיאור'}. בקשו מהמשרד קישור לאזור האישי.`

  const [smsSettled, waSettled, pushSettled] = await Promise.allSettled([
    wantSms
      ? sendWorkerSMSAll(workerPhones, smsMessage, smsSenderName, clientId)
      : Promise.resolve(null),
    wantWa
      ? notifyWorkerAssignmentWhatsApp(supabase, {
          clientId,
          workerPhones,
          buildingName,
          ticketNumber,
          description,
        })
      : Promise.resolve({ sent: 0, failed: 0 } as WorkerAssignmentWaResult),
    wantPush
      ? notifyWorkerAssignedPush(
          supabase,
          workerId,
          clientId,
          ticketNumber,
          description,
          ticketId
        )
      : Promise.resolve(),
  ])

  if (!wantSms) {
    workerSmsNote = 'SMS כבוי להעדפות העובד.'
  } else if (smsSettled.status === 'fulfilled') {
    const batch = smsSettled.value
    workerSms = batch
    if (batch && !batch.ok && batch.sent > 0) {
      workerSmsNote = `SMS נשלח ל-${batch.sent} מתוך ${batch.total} מספרים.`
    } else if (batch && !batch.ok) {
      workerSmsNote = 'שליחת SMS לעובד נכשלה.'
    }
  } else {
    workerSmsNote = 'שגיאה בשליחת SMS לעובד.'
    logger.warn('ASSIGN', 'Worker SMS error', {
      err: smsSettled.reason instanceof Error ? smsSettled.reason.message : String(smsSettled.reason),
    })
  }

  if (!wantWa) {
    workerWhatsAppNote = 'WhatsApp כבוי להעדפות העובד.'
  } else if (waSettled.status === 'fulfilled') {
    workerWhatsApp = waSettled.value
    if (workerWhatsApp.sent > 0 && workerWhatsApp.failed === 0) {
      workerWhatsAppNote = `WhatsApp template נשלח ל-${workerWhatsApp.sent} מספרים.`
    } else if (workerWhatsApp.sent > 0) {
      workerWhatsAppNote = `WhatsApp נשלח ל-${workerWhatsApp.sent}, נכשל ל-${workerWhatsApp.failed}.`
    } else if (workerWhatsApp.failed > 0) {
      workerWhatsAppNote = 'שליחת WhatsApp template לעובד נכשלה.'
    }
  } else {
    workerWhatsAppNote = 'שגיאה בשליחת WhatsApp לעובד.'
    logger.warn('ASSIGN', 'Worker WA template error', {
      err: waSettled.reason instanceof Error ? waSettled.reason.message : String(waSettled.reason),
    })
  }

  if (pushSettled.status === 'rejected') {
    logger.warn('ASSIGN', 'Worker push error', {
      err: pushSettled.reason instanceof Error ? pushSettled.reason.message : String(pushSettled.reason),
    })
  }

  return { workerSms, workerSmsNote, workerWhatsApp, workerWhatsAppNote }
}

export async function assignTicketToWorker(
  supabase: SupabaseClient,
  params: {
    ticketId: string
    workerId: string
    clientId: string
    ticketNumber: number
    description: string | null
    buildingName: string
    smsSenderName?: string | null
    logNotes?: string
    autoFromProject?: boolean
  }
): Promise<AssignTicketToWorkerResult> {
  const logger = getLogger()
  const {
    ticketId,
    workerId,
    clientId,
    ticketNumber,
    description,
    buildingName,
    smsSenderName,
    logNotes,
    autoFromProject,
  } = params

  const { data: worker, error: workerError } = await supabase
    .from('workers')
    .select('id, full_name, phone, extra_phones, access_token, notify_sms, notify_whatsapp, notify_push')
    .eq('id', workerId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .single()

  if (workerError || !worker) {
    return { ok: false, workerSms: null, error: 'Worker not found' }
  }

  const { data: updatedTicket, error: updateError } = await supabase
    .from('tickets')
    .update({
      assigned_worker_id: workerId,
      status: 'ASSIGNED',
      updated_at: new Date().toISOString(),
    })
    .eq('id', ticketId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .select()
    .single()

  if (updateError) {
    logger.warn('ASSIGN', 'ticket assign update failed', {
      ticketId,
      workerId,
      err: updateError.message,
    })
    return { ok: false, workerSms: null, error: updateError.message }
  }

  const w = worker as WorkerRow
  const notes =
    logNotes?.trim() ||
    `Ticket assigned to worker ${w.full_name}`

  const { error: logError } = await supabase.from('ticket_logs').insert({
    ticket_id: ticketId,
    action_type: 'ASSIGNED_TO_WORKER',
    notes,
    created_by: 'system',
    meta: {
      worker_id: w.id,
      worker_name: w.full_name,
      auto_from_project: autoFromProject === true,
    },
  })

  if (logError) {
    logger.warn('ASSIGN', 'ticket_logs insert failed (non-blocking)', { err: logError.message })
  }

  const notifyOpts = {
    supabase,
    logger,
    worker: w,
    workerId,
    clientId,
    ticketId,
    ticketNumber,
    description,
    buildingName,
    smsSenderName,
  }

  let workerSms: WorkerSmsBatchResult | null = null
  let workerSmsNote: string | undefined
  let workerWhatsApp: WorkerAssignmentWaResult | null = null
  let workerWhatsAppNote: string | undefined
  let notificationsQueued = false

  if (shouldSyncTicketNotifications()) {
    const n = await sendAssignTicketNotifications(notifyOpts)
    workerSms = n.workerSms
    workerSmsNote = n.workerSmsNote
    workerWhatsApp = n.workerWhatsApp
    workerWhatsAppNote = n.workerWhatsAppNote
  } else {
    notificationsQueued = true
    runAfterResponse('assign-ticket-notify', async () => {
      await sendAssignTicketNotifications(notifyOpts)
    })
  }


  return {
    ok: true,
    updatedTicket: updatedTicket as Record<string, unknown>,
    workerSms,
    workerSmsNote,
    workerWhatsApp,
    workerWhatsAppNote,
    notificationsQueued,
  }
}

export type AutoAssignFromProjectResult = {
  assigned: boolean
  workerId?: string
  assign?: AssignTicketToWorkerResult
}

/**
 * If the project has a fixed maintenance worker (שינוי שיבוץ), assign the new ticket like manual assign.
 */
export async function autoAssignTicketFromProject(
  supabase: SupabaseClient,
  params: {
    ticketId: string
    clientId: string
    projectId: string
    ticketNumber: number
    description: string | null
    smsSenderName?: string | null
    projectName?: string | null
  }
): Promise<AutoAssignFromProjectResult> {
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('assigned_worker_id, name')
    .eq('id', params.projectId)
    .eq('client_id', params.clientId)
    .maybeSingle()

  if (projectError || !project) {
    return { assigned: false }
  }

  const workerId = (project as { assigned_worker_id?: string | null }).assigned_worker_id
  if (!workerId) {
    return { assigned: false }
  }

  const buildingName =
    params.projectName?.trim() ||
    (project as { name?: string | null }).name?.trim() ||
    'ללא שם בניין'

  const assign = await assignTicketToWorker(supabase, {
    ticketId: params.ticketId,
    workerId,
    clientId: params.clientId,
    ticketNumber: params.ticketNumber,
    description: params.description,
    buildingName,
    smsSenderName: params.smsSenderName,
    logNotes: `שיבוץ אוטומטי מפרויקט (${buildingName}) לעובד`,
    autoFromProject: true,
  })

  return {
    assigned: assign.ok,
    workerId,
    assign,
  }
}
