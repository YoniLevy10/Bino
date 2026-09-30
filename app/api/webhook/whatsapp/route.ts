import { NextRequest, NextResponse } from 'next/server'
import { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { resolveClientIdByWhatsAppPhoneNumberId } from '@/lib/tenant-resolution'
import {
  parseAllIncomingWhatsAppMessages,
  extractWhatsAppPhoneNumberId,
  type ParsedWhatsAppMessage,
} from '@/lib/whatsapp-parser'
import { webhookDedupeMessageId } from '@/lib/whatsapp-webhook-dedupe'
import { verifyWhatsAppWebhookSignature } from '@/lib/whatsapp-meta-signature'
import { checkWhatsAppWebhookPhoneRateLimit } from '@/lib/rate-limit'
import { getLogger } from '@/lib/logging'
import { logCriticalOperationalFailure } from '@/lib/error-logs-db'
import {
  runWhatsAppInboundBackground,
  type WaWebhookTenant,
} from '@/lib/whatsapp-webhook/dispatch-inbound'

export const maxDuration = 60

const logger = getLogger()

export async function GET(req: NextRequest) {
  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || ''
  const searchParams = req.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (!VERIFY_TOKEN) {
    return new NextResponse('Server configuration error', { status: 500 })
  }

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new NextResponse(challenge || 'OK', { status: 200 })
  }

  return new NextResponse('Verification failed', { status: 403 })
}

async function processOneInboundMessage(opts: {
  body: unknown
  parsedMessage: ParsedWhatsAppMessage
  requestId: string
  supabaseAdmin: SupabaseClient
  tenantPayload: WaWebhookTenant
}): Promise<'ok' | 'duplicate' | 'failed'> {
  const { body, parsedMessage, requestId, supabaseAdmin, tenantPayload } = opts
  const dedupeMessageId = webhookDedupeMessageId(parsedMessage)
  const { error: dupErr } = await supabaseAdmin.from('processed_webhooks').insert({
    message_id: dedupeMessageId,
    client_id: tenantPayload.clientId,
  })
  if (dupErr && dupErr.code === '23505') {
    return 'duplicate'
  }
  if (dupErr) {
    logger.error('WEBHOOK', 'processed_webhooks insert failed', new Error(dupErr.message), {
      requestId,
      dedupeMessageId,
    })
    return 'failed'
  }

  try {
    await runWhatsAppInboundBackground(
      body,
      requestId,
      parsedMessage,
      supabaseAdmin,
      tenantPayload
    )
    return 'ok'
  } catch (error) {
    // Audit #13: reclaim dedupe so Meta retry can reprocess after a failed handle.
    await supabaseAdmin
      .from('processed_webhooks')
      .delete()
      .eq('message_id', dedupeMessageId)
      .eq('client_id', tenantPayload.clientId)
    throw error
  }
}

export async function POST(req: NextRequest) {
  const requestId = `webhook-whatsapp-${Date.now()}`
  logger.info('WEBHOOK', 'WhatsApp webhook POST received', { requestId })

  try {
    const rawBody = await req.text()
    const metaSecret = (process.env.WHATSAPP_APP_SECRET || '').trim()
    const sigHdr = req.headers.get('x-hub-signature-256')

    // Audit #11: fail closed when secret missing (except local/test).
    if (!metaSecret) {
      if (process.env.NODE_ENV === 'production') {
        logger.error('WEBHOOK', 'WHATSAPP_APP_SECRET missing', new Error('meta_secret_missing'), {
          requestId,
        })
        return NextResponse.json({ error: 'webhook not configured' }, { status: 503 })
      }
    } else if (!verifyWhatsAppWebhookSignature(rawBody, sigHdr, metaSecret)) {
      logger.error('WEBHOOK', 'invalid signature', new Error('meta_signature_mismatch'), {
        requestId,
      })
      return NextResponse.json({ error: 'invalid signature' }, { status: 403 })
    }

    let body: unknown
    try {
      body = JSON.parse(rawBody) as unknown
    } catch {
      // Malformed payload — not recoverable by retry.
      return NextResponse.json({ received: true }, { status: 200 })
    }

    let supabaseAdmin: SupabaseClient
    try {
      supabaseAdmin = getSupabaseAdmin()
    } catch (envError) {
      const error = envError instanceof Error ? envError : new Error(String(envError))
      logger.error('WEBHOOK', 'Failed to initialize Supabase admin', error, { requestId })
      return NextResponse.json({ error: 'temporary failure' }, { status: 503 })
    }

    const parsedMessages = parseAllIncomingWhatsAppMessages(body)
    if (parsedMessages.length === 0) {
      // Status callbacks / empty — ACK.
      return NextResponse.json({ received: true }, { status: 200 })
    }

    const phoneNumberId = extractWhatsAppPhoneNumberId(body)
    if (!phoneNumberId) {
      return NextResponse.json({ error: 'missing phone_number_id' }, { status: 400 })
    }

    const waRl = await checkWhatsAppWebhookPhoneRateLimit(supabaseAdmin, phoneNumberId)
    if (waRl.isLimited) {
      logger.warn('WEBHOOK', 'rate limited', { requestId, phoneNumberId })
      return NextResponse.json({ error: 'rate limited' }, { status: 429 })
    }

    const tenantResolved = await resolveClientIdByWhatsAppPhoneNumberId(
      supabaseAdmin,
      phoneNumberId
    )
    if (!tenantResolved) {
      logger.error(
        'WEBHOOK',
        'No client for WhatsApp phone_number_id',
        new Error('no_client_for_phone_number_id'),
        { requestId, phoneNumberId }
      )
      void logCriticalOperationalFailure({
        context: 'whatsapp_webhook:tenant_resolve',
        message: `No client for WhatsApp phone_number_id ${phoneNumberId}`,
        details: { requestId, phoneNumberId },
        alertKind: 'operational_error',
        alertTitle: 'WhatsApp webhook — טננט לא נמצא',
      })
      // Retryable: secret/config race or ambiguous phone id may be fixed shortly.
      return NextResponse.json({ error: 'tenant not found' }, { status: 503 })
    }

    const tenantPayload: WaWebhookTenant = {
      clientId: tenantResolved.clientId,
      row: tenantResolved.row,
    }

    let anyFailed = false
    for (let i = 0; i < parsedMessages.length; i++) {
      const parsedMessage = parsedMessages[i]
      const msgRequestId = parsedMessages.length > 1 ? `${requestId}-${i}` : requestId
      try {
        const result = await processOneInboundMessage({
          body,
          parsedMessage,
          requestId: msgRequestId,
          supabaseAdmin,
          tenantPayload,
        })
        if (result === 'failed') anyFailed = true
      } catch (error) {
        anyFailed = true
        const err = error instanceof Error ? error : new Error(String(error))
        logger.error('WEBHOOK', 'Inbound message processing failed', err, {
          requestId: msgRequestId,
        })
      }
    }

    if (anyFailed) {
      return NextResponse.json({ error: 'processing failed' }, { status: 503 })
    }

    return NextResponse.json({ received: true, status: 'ok' }, { status: 200 })
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    logger.error('WEBHOOK', 'WhatsApp webhook POST error', err, { requestId })
    void logCriticalOperationalFailure({
      context: 'whatsapp_webhook:route',
      message: err.message,
      details: { requestId, stack: err.stack?.slice(0, 2000) },
      alertKind: 'operational_error',
      alertTitle: 'שגיאה ב-webhook WhatsApp',
    })
    return NextResponse.json({ error: 'temporary failure' }, { status: 503 })
  }
}
