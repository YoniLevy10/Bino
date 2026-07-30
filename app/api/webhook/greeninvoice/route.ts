import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getLogger } from '@/lib/logging'
import { markChargePaidByMorningIds } from '@/lib/collection-charge-ops'
import {
  authorizeGreenInvoiceWebhook,
  extractGreenInvoiceWebhookIds,
} from '@/lib/greeninvoice-webhook'

/**
 * Morning (Green Invoice) webhook — payment / document events.
 * Configure in Morning: Settings → Webhooks →
 *   callback URL = {APP_URL}/api/webhook/greeninvoice?token={GREENINVOICE_WEBHOOK_SECRET}
 *
 * Morning does not sign webhooks; verify via shared query token.
 * Body may be JSON or application/x-www-form-urlencoded.
 */

async function parsePayload(req: Request): Promise<unknown> {
  const contentType = (req.headers.get('content-type') || '').toLowerCase()
  const rawBody = await req.text()
  if (!rawBody) return null

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const params = new URLSearchParams(rawBody)
    const asObj: Record<string, string> = {}
    params.forEach((value, key) => {
      asObj[key] = value
    })
    for (const key of ['payload', 'data', 'json', 'body']) {
      const raw = asObj[key]
      if (raw?.trim().startsWith('{')) {
        try {
          return JSON.parse(raw)
        } catch {
          /* keep form object */
        }
      }
    }
    for (const value of Object.values(asObj)) {
      if (value.trim().startsWith('{')) {
        try {
          return JSON.parse(value)
        } catch {
          /* ignore */
        }
      }
    }
    return asObj
  }

  try {
    return JSON.parse(rawBody)
  } catch {
    return { raw: rawBody.slice(0, 2000) }
  }
}

function isAuthorized(req: Request): boolean {
  const url = new URL(req.url)
  return authorizeGreenInvoiceWebhook({
    expectedSecret: process.env.GREENINVOICE_WEBHOOK_SECRET,
    tokenFromQuery: url.searchParams.get('token'),
    tokenFromHeader: req.headers.get('x-webhook-token'),
  })
}

export async function POST(req: Request) {
  const logger = getLogger()
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    const payload = await parsePayload(req)
    const ids = extractGreenInvoiceWebhookIds(payload)

    logger.info('WEBHOOK', 'Green Invoice webhook received', {
      paymentIds: ids.paymentIds.slice(0, 5),
      documentIds: ids.documentIds.slice(0, 5),
      payloadPreview:
        typeof payload === 'object' && payload !== null
          ? JSON.stringify(payload).slice(0, 500)
          : String(payload).slice(0, 500),
    })

    const admin = getSupabaseAdmin()
    const { matched } = await markChargePaidByMorningIds(admin, ids)

    return NextResponse.json({ ok: true, matched })
  } catch (e) {
    console.error('[webhook/greeninvoice]', e)
    return NextResponse.json({ error: 'internal' }, { status: 500 })
  }
}

/** Some providers verify webhook URL with GET. */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return NextResponse.json({ ok: true, service: 'greeninvoice-webhook' })
}
