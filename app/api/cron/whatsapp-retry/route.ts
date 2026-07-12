import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { verifyCronRequest } from '@/lib/cron-auth'
import {
  sendRawWhatsAppPayloadWithCredentials,
  buildWhatsAppTemplatePayloadForRetry,
  type WhatsAppMetaError,
} from '@/lib/whatsapp-send'
import { notifyWhatsAppSendRetriesExhausted } from '@/lib/error-logs-db'
import { getLogger } from '@/lib/logging'
import {
  formatWhatsAppTemplateFailureMessage,
  resolveWhatsAppRetryTemplateName,
} from '@/lib/whatsapp-meta-errors'

type Details = {
  client_id?: string
  to?: string
  body?: string
  send_kind?: 'text' | 'template' | 'image_template' | string
  template_name?: string
  template_params?: string[]
  template_language?: string
  header_image_link?: string
  meta_error_code?: number
  meta_http_status?: number
  meta_error_message?: string
}

function buildRetryPayload(d: Details): Record<string, unknown> | null {
  const to = d.to || ''
  const sendKind = d.send_kind

  if (sendKind === 'text' || (!sendKind && d.body && !/^[a-z0-9_]+$/.test(d.body))) {
    return {
      to,
      type: 'text',
      text: { body: d.body || '' },
    }
  }

  const templateName = resolveWhatsAppRetryTemplateName(d)
  if (!templateName) return null

  const params = Array.isArray(d.template_params) ? d.template_params.map(String) : []
  const lang = d.template_language || 'he'

  if (sendKind === 'image_template' || d.header_image_link) {
    const components: Array<Record<string, unknown>> = []
    const headerImageLink = d.header_image_link?.trim()
    if (headerImageLink) {
      components.push({
        type: 'header',
        parameters: [{ type: 'image', image: { link: headerImageLink } }],
      })
    }
    if (params.length > 0) {
      components.push({
        type: 'body',
        parameters: params.map((text) => ({ type: 'text', text })),
      })
    }
    return {
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: lang },
        components,
      },
    }
  }

  return buildWhatsAppTemplatePayloadForRetry(to, templateName, params, lang)
}

function formatRetryFailureMessage(d: Details, meta?: WhatsAppMetaError): string {
  const templateName = resolveWhatsAppRetryTemplateName(d)
  if (templateName) {
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
      const isTemplateSend =
        d.send_kind === 'template' ||
        d.send_kind === 'image_template' ||
        Boolean(templateName)
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

      const payload = buildRetryPayload(d)
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
