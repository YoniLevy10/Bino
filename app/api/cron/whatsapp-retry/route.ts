import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { verifyCronRequest } from '@/lib/cron-auth'
import {
  sendRawWhatsAppPayloadWithCredentials,
  type WhatsAppMetaError,
} from '@/lib/whatsapp-send'
import { notifyWhatsAppSendRetriesExhausted } from '@/lib/error-logs-db'
import { getLogger } from '@/lib/logging'
import {
  extractWhatsAppMessageId,
  formatWhatsAppTemplateFailureMessage,
  isWhatsAppFreeTextRetry,
  resolveWhatsAppRetryTemplateName,
} from '@/lib/whatsapp-meta-errors'
import {
  buildWhatsAppRetryPayload,
  type WhatsAppRetryDetails,
} from '@/lib/whatsapp-retry-payload'

export const maxDuration = 60

type Details = WhatsAppRetryDetails

function formatRetryFailureMessage(d: Details, meta?: WhatsAppMetaError): string {
  const templateName = resolveWhatsAppRetryTemplateName(d)
  if (templateName && !isWhatsAppFreeTextRetry(d)) {
    return formatWhatsAppTemplateFailureMessage(templateName, meta)
  }
  if (meta?.message?.trim()) return meta.message.trim()
  return 'WhatsApp retry send returned null'
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
      .select('id, details, whatsapp_attempts, message')
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
      const templateName = resolveWhatsAppRetryTemplateName(d)
      const hasTextBody = Boolean(d.body?.trim())
      const isFreeText = isWhatsAppFreeTextRetry(d)
      const isTemplateSend =
        !isFreeText &&
        (d.send_kind === 'template' ||
          d.send_kind === 'image_template' ||
          Boolean(templateName))
      if (!d.client_id || !d.to || (!hasTextBody && !isTemplateSend)) {
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
        const nextAttempts = attempts + 1
        await admin
          .from('error_logs')
          .update({
            whatsapp_attempts: nextAttempts,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id)
        if (nextAttempts >= 3 && d.client_id && d.to) {
          void notifyWhatsAppSendRetriesExhausted(
            d.client_id,
            d.to,
            'WhatsApp credentials missing or invalid for retry',
            { ...d, send_kind: d.send_kind, attempts: nextAttempts }
          )
        }
        retried++
        continue
      }

      const payload = buildWhatsAppRetryPayload(d)
      if (!payload) {
        const errMsg = 'WhatsApp retry skipped: missing or invalid template name in error_logs'
        await admin
          .from('error_logs')
          .update({
            whatsapp_attempts: 3,
            message: errMsg,
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id)
        void notifyWhatsAppSendRetriesExhausted(d.client_id, d.to, errMsg, { ...d, attempts: 3 })
        retried++
        continue
      }

      retried++
      const metaErr: { current?: WhatsAppMetaError } = {}
      try {
        const sent = await sendRawWhatsAppPayloadWithCredentials(
          client.whatsapp_phone_number_id,
          client.whatsapp_access_token,
          payload,
          metaErr
        )
        if (sent) {
          const nextAttempts = attempts + 1
          const metaMessageId = extractWhatsAppMessageId(sent)
          const now = new Date().toISOString()
          await admin
            .from('error_logs')
            .update({
              resolved: true,
              resolved_at: now,
              updated_at: now,
              whatsapp_attempts: nextAttempts,
              message: `resolved by whatsapp-retry (attempt ${nextAttempts})${
                metaMessageId ? ` wamid=${metaMessageId}` : ''
              }`.slice(0, 8000),
              details: {
                ...d,
                resolved_by: 'whatsapp-retry',
                resolved_attempt: nextAttempts,
                meta_message_id: metaMessageId,
              },
            })
            .eq('id', row.id)
          fixed++
        } else {
          throw new Error(formatRetryFailureMessage(d, metaErr.current))
        }
      } catch (e) {
        const nextAttempts = attempts + 1
        const errMsg = e instanceof Error ? e.message.slice(0, 8000) : String(e).slice(0, 8000)
        await admin
          .from('error_logs')
          .update({
            whatsapp_attempts: nextAttempts,
            message: errMsg,
            updated_at: new Date().toISOString(),
            details: {
              ...d,
              meta_error_code: metaErr.current?.metaCode ?? d.meta_error_code,
              meta_http_status: metaErr.current?.httpStatus ?? d.meta_http_status,
              meta_error_message: metaErr.current?.message ?? d.meta_error_message,
              last_retry_at: new Date().toISOString(),
            },
          })
          .eq('id', row.id)

        if (nextAttempts >= 3 && d.client_id && d.to) {
          void notifyWhatsAppSendRetriesExhausted(d.client_id, d.to, errMsg, {
            ...d,
            send_kind: d.send_kind,
            attempts: nextAttempts,
            meta_error_code: metaErr.current?.metaCode ?? d.meta_error_code,
            meta_http_status: metaErr.current?.httpStatus ?? d.meta_http_status,
          })
        }
      }
    }

    return NextResponse.json({ ok: true, retried, fixed })
  } catch (e) {
    logger.error('CRON', 'whatsapp-retry fatal', e instanceof Error ? e : new Error(String(e)))
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
