import type { SupabaseClient } from '@supabase/supabase-js'
import { sendWorkerSMSAll } from '@/lib/sms-send'
import { collectWorkerPhones } from '@/lib/worker-phones'
import { getWorkerPortalUrl } from '@/lib/public-app-url'
import { getLogger } from '@/lib/logging'
import { sendWhatsAppTextMessage } from '@/lib/whatsapp-send'
import webpush from 'web-push'

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

function initWebPush(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  if (!publicKey || !privateKey) return false
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:support@bino.app'
  webpush.setVapidDetails(subject, publicKey, privateKey)
  return true
}

async function notifyMaintenanceTaskPush(
  admin: SupabaseClient,
  workerId: string,
  clientId: string,
  taskId: string,
  title: string
): Promise<void> {
  if (!initWebPush()) return
  const { data: rows, error } = await admin
    .from('worker_push_subscriptions')
    .select('id, subscription')
    .eq('worker_id', workerId)
    .eq('client_id', clientId)
  if (error || !rows?.length) return

  const payload = JSON.stringify({
    title: 'משימת אחזקה חדשה',
    body: title.trim().slice(0, 80) || 'שויכת לך משימה',
    url: '/worker',
    badge: 1,
    tag: `worker-task-${taskId}`,
  })

  await Promise.allSettled(
    rows.map(async (row) => {
      const sub = row.subscription
      if (!sub || typeof sub !== 'object') return
      try {
        await webpush.sendNotification(sub as webpush.PushSubscription, payload, { TTL: 86400 })
      } catch (e) {
        const status =
          e && typeof e === 'object' && 'statusCode' in e
            ? (e as { statusCode?: number }).statusCode
            : undefined
        if (status === 404 || status === 410) {
          if (row.id) await admin.from('worker_push_subscriptions').delete().eq('id', row.id)
        }
      }
    })
  )
}

/**
 * Notify a worker when a maintenance task is assigned to them.
 * Honors workers.notify_sms / notify_whatsapp / notify_push (same prefs as ticket assign).
 */
export async function notifyWorkerMaintenanceTaskAssigned(
  admin: SupabaseClient,
  params: {
    clientId: string
    workerId: string
    taskId: string
    title: string
    ticketNumber?: number | null
    smsSenderName?: string | null
  }
): Promise<void> {
  const logger = getLogger()
  const { clientId, workerId, taskId, title, ticketNumber, smsSenderName } = params

  const { data: worker, error } = await admin
    .from('workers')
    .select('id, full_name, phone, extra_phones, access_token, notify_sms, notify_whatsapp, notify_push')
    .eq('id', workerId)
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !worker) {
    logger.warn('MAINT_TASK', 'Worker not found for task notify', { workerId, clientId, err: error?.message })
    return
  }

  const w = worker as WorkerRow
  const phones = collectWorkerPhones(w)
  const wantSms = w.notify_sms !== false
  const wantWa = w.notify_whatsapp !== false
  const wantPush = w.notify_push !== false

  const portalUrl = w.access_token?.trim() ? getWorkerPortalUrl(w.access_token) : null
  const ticketBit =
    typeof ticketNumber === 'number' && ticketNumber > 0 ? ` (תקלה #${ticketNumber})` : ''
  const message = portalUrl
    ? `שויכת למשימת אחזקה${ticketBit}: ${title}. האזור האישי: ${portalUrl}`
    : `שויכת למשימת אחזקה${ticketBit}: ${title}. בקשו מהמשרד קישור לאזור האישי.`

  const jobs: Promise<unknown>[] = []

  if (wantSms && phones.length > 0) {
    jobs.push(sendWorkerSMSAll(phones, message, smsSenderName, clientId))
  }

  if (wantPush) {
    jobs.push(notifyMaintenanceTaskPush(admin, workerId, clientId, taskId, title))
  }

  if (wantWa && phones.length > 0) {
    jobs.push(
      (async () => {
        const { data: clientRow } = await admin
          .from('clients')
          .select('whatsapp_phone_number_id, whatsapp_access_token')
          .eq('id', clientId)
          .maybeSingle()
        const phoneNumberId = (clientRow as { whatsapp_phone_number_id?: string | null } | null)
          ?.whatsapp_phone_number_id
        const accessToken = (clientRow as { whatsapp_access_token?: string | null } | null)
          ?.whatsapp_access_token
        if (!phoneNumberId || !accessToken) return
        for (const phone of phones) {
          await sendWhatsAppTextMessage(
            phone,
            message,
            { phoneNumberId, accessToken },
            { clientId, logOnFailure: true }
          )
        }
      })()
    )
  }

  const settled = await Promise.allSettled(jobs)
  for (const s of settled) {
    if (s.status === 'rejected') {
      logger.warn('MAINT_TASK', 'Worker task notify channel failed', {
        workerId,
        taskId,
        err: s.reason instanceof Error ? s.reason.message : String(s.reason),
      })
    }
  }
}
