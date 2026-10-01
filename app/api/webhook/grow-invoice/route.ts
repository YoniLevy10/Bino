import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getLogger } from '@/lib/logging'
import { authorizeGrowWebhook, expandBracketFormKeys } from '@/lib/grow-webhook'
import { findChargeIdsByGrowIds } from '@/lib/collection-charge-ops'
import { sendCollectionInvoiceEmailIfNeeded } from '@/lib/collection-invoice-email'
import { extractGrowInvoiceWebhookFields } from '@/lib/grow-invoice-webhook'

async function parsePayload(req: Request): Promise<unknown> {
  const contentType = (req.headers.get('content-type') || '').toLowerCase()
  const rawBody = await req.text()
  if (!rawBody) return null
  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    (!contentType.includes('application/json') &&
      rawBody.includes('=') &&
      !rawBody.trimStart().startsWith('{'))
  ) {
    const params = new URLSearchParams(rawBody)
    const asObj: Record<string, string> = {}
    params.forEach((value, key) => {
      asObj[key] = value
    })
    for (const value of Object.values(asObj)) {
      if (value.trim().startsWith('{')) {
        try {
          return JSON.parse(value)
        } catch {
          /* ignore */
        }
      }
    }
    return expandBracketFormKeys(asObj)
  }
  try {
    return JSON.parse(rawBody)
  } catch {
    return { raw: rawBody.slice(0, 2000) }
  }
}

function isAuthorized(req: Request): boolean {
  const url = new URL(req.url)
  return authorizeGrowWebhook({
    expectedSecret: process.env.GROW_WEBHOOK_SECRET,
    tokenFromQuery: url.searchParams.get('token'),
    tokenFromHeader: req.headers.get('x-webhook-token'),
  })
}

export async function GET() {
  return NextResponse.json({ ok: true, route: 'grow-invoice' })
}

export async function POST(req: Request) {
  const logger = getLogger()
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const payload = await parsePayload(req)
    const fields = extractGrowInvoiceWebhookFields(payload)

    const admin = getSupabaseAdmin()
    const chargeIds = await findChargeIdsByGrowIds(admin, {
      publicTokens: fields.publicToken ? [fields.publicToken] : [],
      paymentLinkIds: fields.processId ? [fields.processId] : [],
      processIds: fields.processId ? [fields.processId] : [],
      transactionIds: fields.transactionId ? [fields.transactionId] : [],
    })

    logger.info('WEBHOOK', 'Grow invoice webhook', {
      matched: chargeIds.length,
      hasInvoiceId: Boolean(fields.invoiceId),
      hasInvoiceUrl: Boolean(fields.invoiceUrl),
      documentType: fields.documentType,
      payloadKeys: fields.payloadKeys.slice(0, 40),
    })

    if (chargeIds.length === 0) {
      return NextResponse.json({
        ok: true,
        matched: 0,
        document_type: fields.documentType,
        payload_keys: fields.payloadKeys,
      })
    }

    const now = new Date().toISOString()
    const patch: Record<string, string | null> = {
      grow_invoice_received_at: now,
      updated_at: now,
      grow_invoice_payload_keys: fields.payloadKeys.join(',').slice(0, 1000),
    }
    if (fields.invoiceId) patch.grow_invoice_id = fields.invoiceId
    if (fields.invoiceUrl) patch.grow_invoice_url = fields.invoiceUrl
    if (fields.documentType) {
      patch.grow_invoice_document_type = fields.documentType.slice(0, 120)
    }

    const { error: updErr } = await admin
      .from('collection_charges')
      .update(patch)
      .in('id', chargeIds)
    if (updErr) {
      logger.error('WEBHOOK', 'Grow invoice update failed', new Error(updErr.message))
      return NextResponse.json({ error: 'db_update_failed' }, { status: 500 })
    }

    // Optional BINO Resend of the Grow document URL — Grow may also email the payer.
    const emailResults: Array<{ chargeId: string; sent: boolean; skipped?: string; error?: string }> =
      []
    for (const chargeId of chargeIds) {
      const result = await sendCollectionInvoiceEmailIfNeeded(admin, chargeId)
      emailResults.push({ chargeId, ...result })
    }

    return NextResponse.json({
      ok: true,
      matched: chargeIds.length,
      document_type: fields.documentType,
      emails: emailResults,
    })
  } catch (e) {
    logger.error('WEBHOOK', 'Grow invoice webhook failed', e instanceof Error ? e : undefined)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}
