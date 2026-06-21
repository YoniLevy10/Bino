import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { verifyCronRequest } from '@/lib/cron-auth'
import { sendRawWhatsAppPayloadWithCredentials, buildWhatsAppTemplatePayloadForRetry } from '@/lib/whatsapp-send'
import { getLogger } from '@/lib/logging'

type Details = {
  client_id?: string
  to?: string
  body?: string
  send_kind?: 'text' | 'template'
  template_params?: string[]
  template_language?: string
}

export async function GET(req: NextRequest) {
  const logger = getLogger()
  if (!verifyCronRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = getSupabaseAdmin()
    const { data: rows, error } = await admin
      .from('error_logs')
      .select('id, details, whatsapp_attempts')
      .eq('context', 'whatsapp_send')
      .eq('resolved', false)
      .lt('whatsapp_attempts', 3)

    if (error) {
      logger.error('CRON', 'whatsapp-retry list failed', new Error(error.message))
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    let retried = 0
    let fixed = 0

    for (const row of rows || []) {
      const d = (row.details || {}) as Details
      const attempts = typeof row.whatsapp_attempts === 'number' ? row.whatsapp_attempts : 1
      if (!d.client_id || !d.to || !d.body) {
        await admin
          .from('error_logs')
          .update({ whatsapp_attempts: 3, updated_at: new Date().toISOString() })
          .eq('id', row.id)
        continue
      }

      const { data: client, error: cErr } = await admin
        .from('clients')
        .select('whatsapp_phone_number_id, whatsapp_access_token')
        .eq('id', d.client_id)
        .maybeSingle()

      if (cErr || !client?.whatsapp_phone_number_id || !client?.whatsapp_access_token) {
        await admin
          .from('error_logs')
          .update({
            whatsapp_attempts: attempts + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id)
        retried++
        continue
      }

      retried++
      try {
        const isTemplate = d.send_kind === 'template' || (!d.send_kind && d.body && /^[a-z0-9_]+$/.test(d.body))
        const payload = isTemplate
          ? buildWhatsAppTemplatePayloadForRetry(
              d.to,
              d.body || '',
              Array.isArray(d.template_params) ? d.template_params.map(String) : [],
              d.template_language || 'he'
            )
          : {
              to: d.to,
              type: 'text',
              text: { body: d.body },
            }
        const sent = await sendRawWhatsAppPayloadWithCredentials(
          client.whatsapp_phone_number_id,
          client.whatsapp_access_token,
          payload
        )
        if (sent) {
          await admin
            .from('error_logs')
            .update({
              resolved: true,
              resolved_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', row.id)
          fixed++
        } else {
          throw new Error('WhatsApp retry send returned null')
        }
      } catch (e) {
        const nextAttempts = attempts + 1
        await admin
          .from('error_logs')
          .update({
            whatsapp_attempts: nextAttempts,
            updated_at: new Date().toISOString(),
            message: e instanceof Error ? e.message.slice(0, 8000) : String(e).slice(0, 8000),
          })
          .eq('id', row.id)
      }
    }

    return NextResponse.json({ ok: true, retried, fixed })
  } catch (e) {
    logger.error('CRON', 'whatsapp-retry fatal', e instanceof Error ? e : new Error(String(e)))
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
