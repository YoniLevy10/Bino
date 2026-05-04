import { NextRequest, NextResponse } from 'next/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getLogger } from '@/lib/logging'
import { fetchWithTimeout } from '@/lib/fetch-timeout'
import { sendManagerSMS, getManagerPhoneFromEnv } from '@/lib/sms-send'

/**
 * Periodic probe: pings DB + validates WhatsApp tokens + appends system_logs (Vercel cron).
 */
export async function GET(req: NextRequest) {
  const logger = getLogger()
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ts = new Date().toISOString()
  const summary: Record<string, unknown> = { ts }

  try {
    const admin = getSupabaseAdmin()

    // --- DB ping ---
    const { error: dbError } = await admin.from('clients').select('id').limit(1)
    const dbOk = !dbError
    summary.db = dbOk ? 'ok' : 'error'

    await admin.from('system_logs').insert({
      level: dbOk ? 'info' : 'error',
      source: 'cron.health-check',
      message: dbOk ? 'db_connected' : 'db_failed',
      payload: dbOk ? { ts } : { ts, detail: dbError?.message },
    })

    if (!dbOk) {
      logger.error('CRON', 'health-check DB failed', new Error(dbError?.message || 'unknown'))
      return NextResponse.json({ status: 'error', ...summary }, { status: 503 })
    }

    // --- WhatsApp token validation ---
    const { data: waClients } = await admin
      .from('clients')
      .select('id, name, whatsapp_phone_number_id, whatsapp_access_token, manager_phone, sms_sender_name')
      .not('whatsapp_phone_number_id', 'is', null)
      .not('whatsapp_access_token', 'is', null)

    const tokenResults: Array<{ clientId: string; status: 'ok' | 'expired' | 'error' }> = []

    for (const client of waClients || []) {
      const phoneNumberId = client.whatsapp_phone_number_id as string
      const accessToken = client.whatsapp_access_token as string
      const clientId = client.id as string
      const clientName = (client.name as string | null) || 'לקוח'
      const senderName = (client.sms_sender_name as string | null) || 'במקור'

      let tokenStatus: 'ok' | 'expired' | 'error' = 'error'

      try {
        const resp = await fetchWithTimeout(
          `https://graph.facebook.com/v23.0/${phoneNumberId}?fields=display_phone_number,verified_name`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
          8_000
        )

        if (!resp) {
          tokenStatus = 'error'
        } else if (resp.ok) {
          tokenStatus = 'ok'
        } else {
          const body = await resp.json().catch(() => ({})) as { error?: { code?: number } }
          tokenStatus = body?.error?.code === 190 ? 'expired' : 'error'
        }
      } catch {
        tokenStatus = 'error'
      }

      tokenResults.push({ clientId, status: tokenStatus })

      if (tokenStatus !== 'ok') {
        const isExpired = tokenStatus === 'expired'
        const logMsg = isExpired ? 'whatsapp_token_expired' : 'whatsapp_token_check_failed'
        const alertMsg = isExpired
          ? `🚨 ALERT: ה-WhatsApp token של ${clientName} פג תוקף! כל ההודעות נכשלות. יש לעדכן whatsapp_access_token ב-Supabase מיד.`
          : `⚠️ ALERT: לא ניתן לאמת את ה-WhatsApp token של ${clientName}. ייתכן שפג תוקפו.`

        console.error(`🚨 HEALTH_CHECK: ${logMsg}`, { clientId, clientName })

        await admin.from('system_logs').insert({
          level: 'error',
          source: 'cron.health-check',
          message: logMsg,
          payload: { ts, client_id: clientId, client_name: clientName },
        })

        // SMS alert to admin — use client manager_phone or global env fallback
        const dest = (client.manager_phone as string | null) || getManagerPhoneFromEnv()
        if (dest) {
          await sendManagerSMS(dest, alertMsg, senderName, clientId).catch((e) => {
            console.error('health-check: SMS alert failed:', e)
          })
        }
      }
    }

    summary.whatsapp = tokenResults

    return NextResponse.json({ status: dbOk ? 'ok' : 'degraded', ...summary })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.error('CRON', 'health-check exception', e instanceof Error ? e : new Error(msg))
    try {
      const admin = getSupabaseAdmin()
      await admin.from('system_logs').insert({
        level: 'error',
        source: 'cron.health-check',
        message: 'exception',
        payload: { ts, detail: msg },
      })
    } catch {
      /* ignore secondary failure */
    }
    return NextResponse.json({ status: 'error', ...summary, detail: msg }, { status: 503 })
  }
}
