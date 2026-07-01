import { getSupabaseAdmin } from '@/lib/supabase-admin'
import type { PlatformOpsAlertKind } from '@/lib/platform-ops-alert'

export async function insertOperationalErrorLog(args: {
  context: string
  message: string
  clientId?: string | null
  details?: Record<string, unknown>
}): Promise<void> {
  try {
    const admin = getSupabaseAdmin()
    const { error } = await admin.from('error_logs').insert({
      context: args.context.slice(0, 200),
      message: args.message.slice(0, 8000),
      client_id: args.clientId || null,
      details: args.details || {},
      resolved: false,
    })

    if (error) {
      console.error('insertOperationalErrorLog:', error.message)
    }
  } catch (e) {
    console.error('insertOperationalErrorLog', e)
  }
}

/** Log to error_logs and email platform ops (deduped ~30 min). */
export async function logCriticalOperationalFailure(args: {
  context: string
  message: string
  clientId?: string | null
  clientName?: string | null
  details?: Record<string, unknown>
  alertKind: PlatformOpsAlertKind
  alertTitle: string
}): Promise<void> {
  await insertOperationalErrorLog({
    context: args.context,
    message: args.message,
    clientId: args.clientId,
    details: args.details,
  })

  const { notifyPlatformOps } = await import('@/lib/platform-ops-alert')
  void notifyPlatformOps({
    kind: args.alertKind,
    title: args.alertTitle,
    message: args.message,
    clientId: args.clientId,
    clientName: args.clientName,
    details: { ...args.details, context: args.context },
  })
}

/** Persist a failed WhatsApp send for cron retry (context whatsapp_send). */
export async function insertWhatsAppSendFailure(
  clientId: string,
  to: string,
  body: string,
  errorMessage: string,
  detailsExtra?: Record<string, unknown>
): Promise<void> {
  try {
    const admin = getSupabaseAdmin()
    const { error } = await admin.from('error_logs').insert({
      context: 'whatsapp_send',
      message: errorMessage.slice(0, 8000),
      client_id: clientId,
      details: {
        client_id: clientId,
        to: to.slice(0, 64),
        body: body.slice(0, 4000),
        ...detailsExtra,
      },
      resolved: false,
      whatsapp_attempts: 1,
    })
    if (error) {
      console.error('insertWhatsAppSendFailure:', error.message)
    }
  } catch (e) {
    console.error('insertWhatsAppSendFailure', e)
  }
}

/** Called when whatsapp-retry cron exhausts all attempts. */
export async function notifyWhatsAppSendRetriesExhausted(
  clientId: string,
  to: string,
  errorMessage: string,
  detailsExtra?: Record<string, unknown>
): Promise<void> {
  const { notifyPlatformOps } = await import('@/lib/platform-ops-alert')
  void notifyPlatformOps({
    kind: 'whatsapp_failure',
    title: 'כשל שליחת WhatsApp (אחרי ניסיונות)',
    message: errorMessage,
    clientId,
    details: { to: to.slice(0, 64), ...detailsExtra },
  })
}
