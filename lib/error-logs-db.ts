import { getSupabaseAdmin } from '@/lib/supabase-admin'

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
    } else {
      const { notifyPlatformOps } = await import('@/lib/platform-ops-alert')
      void notifyPlatformOps({
        kind: 'whatsapp_failure',
        title: 'כשל שליחת WhatsApp',
        message: errorMessage,
        clientId,
        details: { to: to.slice(0, 64) },
      })
    }
  } catch (e) {
    console.error('insertWhatsAppSendFailure', e)
  }
}
