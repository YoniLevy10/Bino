import type { SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'

function initWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim()
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim()
  if (!publicKey || !privateKey) return false
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:support@bamakor.app'
  webpush.setVapidDetails(subject, publicKey, privateKey)
  return true
}

async function sendPushPayload(
  rows: { id?: string; subscription: unknown }[],
  payload: string,
  onExpired?: (row: { id?: string; subscription: unknown }) => Promise<void>
): Promise<void> {
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
          await onExpired?.(row)
        }
      }
    })
  )
}

type NewTicketPushOpts = {
  ticketNumber?: number | null
}

/**
 * Notify everyone who installed the PWA and enabled push when a new ticket opens
 * (dashboard managers + subscribed field workers).
 */
export async function notifyNewTicketPush(
  admin: SupabaseClient,
  clientId: string,
  description: string | null,
  opts?: NewTicketPushOpts
): Promise<void> {
  if (!initWebPush()) return

  const ticketLabel =
    typeof opts?.ticketNumber === 'number' && opts.ticketNumber > 0
      ? `#${opts.ticketNumber}`
      : ''
  const title = ticketLabel ? `טיקט חדש ${ticketLabel}` : 'טיקט חדש נפתח'
  const body = (description || '').trim().slice(0, 60) || 'תקלה חדשה'
  const tag =
    typeof opts?.ticketNumber === 'number' && opts.ticketNumber > 0
      ? `new-ticket-${opts.ticketNumber}`
      : `new-ticket-${clientId}`

  const [managerRes, workerRes] = await Promise.all([
    admin.from('push_subscriptions').select('id, subscription').eq('client_id', clientId),
    admin.from('worker_push_subscriptions').select('id, subscription').eq('client_id', clientId),
  ])

  const managerRows = managerRes.error ? [] : managerRes.data || []
  const workerRows = workerRes.error ? [] : workerRes.data || []

  if (managerRows.length) {
    const payload = JSON.stringify({
      title,
      body,
      url: '/tickets',
      tag,
      badge: 1,
    })
    await sendPushPayload(managerRows, payload, async (row) => {
      if (row.id) {
        await admin.from('push_subscriptions').delete().eq('id', row.id)
      }
    })
  }

  if (workerRows.length) {
    const payload = JSON.stringify({
      title,
      body,
      url: '/worker',
      tag: `worker-${tag}`,
      badge: 1,
    })
    await sendPushPayload(workerRows, payload, async (row) => {
      if (row.id) {
        await admin.from('worker_push_subscriptions').delete().eq('id', row.id)
      }
    })
  }
}

/** Notify field worker when a ticket is assigned to them. */
export async function notifyWorkerAssignedPush(
  admin: SupabaseClient,
  workerId: string,
  clientId: string,
  ticketNumber: number,
  description: string | null,
  ticketId?: string
): Promise<void> {
  if (!initWebPush()) return

  const { data: rows, error } = await admin
    .from('worker_push_subscriptions')
    .select('id, subscription')
    .eq('worker_id', workerId)
    .eq('client_id', clientId)

  if (error || !rows?.length) return

  const { count: openCount } = await admin
    .from('tickets')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('assigned_worker_id', workerId)
    .is('deleted_at', null)
    .neq('status', 'CLOSED')

  const badge = typeof openCount === 'number' && openCount > 0 ? openCount : 1
  const title = `תקלה #${ticketNumber} שויכה אליך`
  const body = (description || '').trim().slice(0, 60) || 'תקלה חדשה'
  const payload = JSON.stringify({
    title,
    body,
    url: '/worker',
    badge,
    tag: ticketId ? `worker-assign-${ticketId}` : `worker-assign-${ticketNumber}`,
  })
  await sendPushPayload(rows, payload, async (row) => {
    if (row.id) {
      await admin.from('worker_push_subscriptions').delete().eq('id', row.id)
    } else {
      await admin
        .from('worker_push_subscriptions')
        .delete()
        .eq('worker_id', workerId)
        .eq('client_id', clientId)
    }
  })
}

/** Remind worker to clock out if shift open too long. */
export async function notifyWorkerOpenShiftReminderPush(
  admin: SupabaseClient,
  workerId: string,
  clientId: string,
  startedAt: string
): Promise<void> {
  if (!initWebPush()) return

  const { data: rows, error } = await admin
    .from('worker_push_subscriptions')
    .select('id, subscription')
    .eq('worker_id', workerId)
    .eq('client_id', clientId)

  if (error || !rows?.length) return

  const started = new Date(startedAt).toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const payload = JSON.stringify({
    title: 'שכחת לצאת?',
    body: `נראה שאתה עדיין רשום בעבודה מ-${started}. הצמד את הטלפון למדבקה ביציאה.`,
    url: '/worker',
    tag: `open-shift-${workerId}`,
  })
  await sendPushPayload(rows, payload, async (row) => {
    if (row.id) {
      await admin.from('worker_push_subscriptions').delete().eq('id', row.id)
    }
  })
}
